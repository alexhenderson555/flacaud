import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Optional

from tidal_dl_ru.core.set_track_match import clean_title_for_query, dedupe_key, match_tidal_track
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.outbound_url import OutboundUrlError, validate_public_http_url

logger = logging.getLogger(__name__)

# A 429 from the source (SoundCloud/YouTube) is typically a transient burst
# limit, not a permanent block -- retrying after a short backoff turns a brief
# provider hiccup into a successful job instead of a fully failed one the user
# has to notice and manually retry themselves.
_RATE_LIMIT_RETRIES = 2
_RATE_LIMIT_BACKOFF_SECONDS = 20


def _is_rate_limited(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "Too Many Requests" in text


def _friendly_download_error(exc: Exception) -> str:
    if _is_rate_limited(exc):
        return "The source is rate-limiting requests right now. Please try again in a few minutes."
    return f"Failed to download audio: {exc}"


async def _run_yt_dlp_download(job_id: str, download_fn) -> Optional[Exception]:
    """Run a yt-dlp download, retrying on a provider rate-limit before giving
    up. Returns None on success, or the final exception on failure/cancel."""
    last_exc: Optional[Exception] = None
    for attempt in range(_RATE_LIMIT_RETRIES + 1):
        if job_state.is_cancelled(job_id):
            return RuntimeError("cancelled")
        try:
            await asyncio.to_thread(download_fn)
            return None
        except Exception as e:  # noqa: BLE001
            last_exc = e
            if job_state.is_cancelled(job_id) or not _is_rate_limited(e) or attempt == _RATE_LIMIT_RETRIES:
                return e
            logger.info(
                "yt-dlp rate-limited (attempt %s/%s), retrying in %ss: %s",
                attempt + 1, _RATE_LIMIT_RETRIES, _RATE_LIMIT_BACKOFF_SECONDS, e,
            )
            await asyncio.sleep(_RATE_LIMIT_BACKOFF_SECONDS)
    return last_exc

# How many segments to recognize concurrently. Shazam calls are network-bound, so
# batching them cuts scan wall-time ~N×. Raised from 6 -> 10 for faster scans;
# ShazamAPI is unofficial/reverse-engineered, so pushing this further risks the
# same class of rate-limit/ban trouble hit earlier with the Tidal account pool -
# watch for a spike in recognizeSong() failures if this ever needs to go back down.
SHAZAM_CONCURRENCY = 10

# Kept as thin aliases so the rest of this module (and any external callers) don't
# need to change; the real implementation lives in set_track_match so the
# description-tracklist parser can share it.
_clean_title_for_query = clean_title_for_query
_dedupe_key = dedupe_key


def _download_progress_hook(job_id: str):
    last_label = [""]

    def hook(data: dict) -> None:
        if job_state.is_cancelled(job_id):
            raise RuntimeError("Job was cancelled by the user or timed out.")
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
            downloaded = data.get("downloaded_bytes") or 0
            if total > 0:
                pct = min(99, int(downloaded * 100 / total))
                label = f"Downloading Set… {pct}%"
            else:
                mb = downloaded / (1024 * 1024)
                label = f"Downloading Set… {mb:.1f} MB"
            if label != last_label[0]:
                last_label[0] = label
                job_state.update_analysis(
                    job_id,
                    phase="download",
                    percent=pct if total > 0 else min(14, int(mb * 2)),
                    label=label,
                )
        elif status == "finished":
            job_state.update_analysis(
                job_id,
                phase="process",
                percent=15,
                label="Processing audio…",
            )

    return hook


async def download_set_audio_task(job_id: str, url: str) -> dict:
    """ARQ task: fetch a DJ set's raw audio via yt-dlp and cache it (no Shazam
    scan) — used by the "Download set" button, which previously tried to run
    a Tidal-catalog download job against a YouTube/SoundCloud URL and always
    failed with "no provider matches URL"."""
    import yt_dlp

    from tidal_dl_ru.core.set_audio_cache import store_set_audio

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_base = os.path.join(temp_dir, "set_audio")
        audio_file = f"{audio_base}.mp3"

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{audio_base}.%(ext)s',
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 30,
            'retries': 3,
            'fragment_retries': 5,
            'progress_hooks': [_download_progress_hook(job_id)],
        }

        job_state.update_analysis(job_id, phase="download", percent=0, label="Downloading Set… 0%")

        if job_state.is_cancelled(job_id):
            return {"ok": False, "error": "cancelled"}

        # The URL was already validated at job-creation time (routers/jobs.py), but this
        # task may run much later off an arq queue — re-check right before the actual
        # fetch so a DNS record that's since been rebound to a private/loopback address
        # (or the cloud metadata IP) can't slip an SSRF fetch past the original check.
        try:
            validate_public_http_url(url)
        except OutboundUrlError:
            job_state.mark_failed(job_id, "This link is no longer safe to fetch.")
            return {"ok": False, "error": "blocked host"}

        def _download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)

        err = await _run_yt_dlp_download(job_id, _download)
        if err is not None:
            if job_state.is_cancelled(job_id):
                return {"ok": False, "error": "cancelled"}
            job_state.mark_failed(job_id, _friendly_download_error(err))
            return {"ok": False, "error": str(err)}

        if not os.path.exists(audio_file):
            candidates = [
                p for p in os.listdir(temp_dir)
                if p.startswith("set_audio") and not p.endswith(".part")
            ]
            mp3 = next((p for p in candidates if p.endswith(".mp3")), None)
            if mp3:
                audio_file = os.path.join(temp_dir, mp3)
            else:
                job_state.mark_failed(job_id, "Audio file was not created.")
                return {"ok": False, "error": "No audio file"}

        from pathlib import Path

        cached = store_set_audio(url, Path(audio_file))
        if cached is None:
            job_state.mark_failed(job_id, "Failed to cache downloaded audio.")
            return {"ok": False, "error": "cache failed"}

        job_state.update_analysis(job_id, phase="done", percent=100, label="Download complete")
        job_state.mark_done(job_id)
        return {"ok": True}


async def analyze_set_task(
    job_id: str,
    url: str,
    # 30s produced roughly 2x the Shazam calls for little benefit — a track
    # rarely changes within half a minute inside a DJ set, so this halves
    # scan time (and Shazam traffic) with a negligible loss in resolution.
    interval: int = 60
) -> dict:
    import yt_dlp
    from pydub.utils import mediainfo
    from ShazamAPI import Shazam


    results: list = []

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_base = os.path.join(temp_dir, "set_audio")
        audio_file = f"{audio_base}.mp3"

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{audio_base}.%(ext)s',
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 30,
            'retries': 3,
            'fragment_retries': 5,
            'progress_hooks': [_download_progress_hook(job_id)],
        }

        job_state.update_analysis(
            job_id,
            phase="download",
            percent=0,
            label="Downloading Set… 0%",
        )

        if job_state.is_cancelled(job_id):
            return {"ok": False, "error": "cancelled"}

        # See the matching comment in download_set_audio_task above — re-validate here
        # too since this task can also run well after the original request-time check.
        try:
            validate_public_http_url(url)
        except OutboundUrlError:
            friendly = "This link is no longer safe to fetch."
            job_state.mark_failed(job_id, friendly)
            job_state.update_analysis(job_id, phase="failed", percent=0, label=friendly)
            return {"ok": False, "error": "blocked host"}

        def _download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)

        err = await _run_yt_dlp_download(job_id, _download)
        if err is not None:
            if job_state.is_cancelled(job_id):
                return {"ok": False, "error": "cancelled"}
            friendly = _friendly_download_error(err)
            job_state.mark_failed(job_id, friendly)
            job_state.update_analysis(
                job_id,
                phase="failed",
                percent=0,
                label=friendly,
            )
            return {"ok": False, "error": str(err)}

        if not os.path.exists(audio_file):
            # yt-dlp may leave intermediate ext before ffmpeg
            candidates = [
                p for p in os.listdir(temp_dir)
                if p.startswith("set_audio") and not p.endswith(".part")
            ]
            mp3 = next((p for p in candidates if p.endswith(".mp3")), None)
            if mp3:
                audio_file = os.path.join(temp_dir, mp3)
            else:
                job_state.mark_failed(job_id, "Audio file was not created.")
                job_state.update_analysis(
                    job_id,
                    phase="failed",
                    percent=0,
                    label="Audio file was not created.",
                )
                return {"ok": False, "error": "No audio file"}

        from pathlib import Path

        from tidal_dl_ru.core.set_audio_cache import store_set_audio

        store_set_audio(url, Path(audio_file))

        job_state.update_analysis(
            job_id,
            phase="process",
            percent=16,
            label="Reading set duration…",
        )

        # Previously decoded the WHOLE file to PCM via pydub before scanning
        # anything - for a long set that single blocking call was the "process
        # audio" stage users saw stall with no feedback. A duration probe is a
        # metadata-only ffprobe read (near-instant), and each 10s Shazam clip is
        # extracted on demand via ffmpeg seek in the scan loop below instead -
        # so this stage now finishes in well under a second.
        ffmpeg_path = shutil.which("ffmpeg") or "ffmpeg"

        try:
            def _probe_duration():
                info = mediainfo(audio_file)
                return float(info.get("duration") or 0)
            duration_sec = await asyncio.to_thread(_probe_duration)
            if duration_sec <= 0:
                raise RuntimeError("Could not read audio duration")
        except Exception as e:
            job_state.mark_failed(job_id, f"Failed to read audio: {e}")
            job_state.update_analysis(
                job_id,
                phase="failed",
                percent=0,
                label=f"Failed to read audio: {e}",
            )
            return {"ok": False, "error": str(e)}

        total_segments = int(duration_sec // interval)
        last_confirmed = None
        pending_track = None
        pending_timestamp = None
        pending_seg_idx = None
        refinement_tasks: list[asyncio.Task] = []
        refinement_sem = asyncio.Semaphore(SHAZAM_CONCURRENCY)

        job_state.update_analysis(
            job_id,
            phase="scan",
            percent=20,
            label="Analyzing… 0%",
            segments_done=0,
            segments_total=total_segments,
        )

        def _extract_segment_wav(start_sec: float, clip_sec: float = 10) -> bytes:
            result = subprocess.run(
                [
                    ffmpeg_path, "-v", "quiet",
                    "-ss", str(start_sec), "-t", str(clip_sec),
                    "-i", audio_file, "-f", "wav", "-",
                ],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30,
            )
            return result.stdout

        def _shazam_segment(start_sec):
            try:
                wav_bytes = _extract_segment_wav(start_sec)
            except (subprocess.TimeoutExpired, OSError):
                logger.debug("set_analyzer: ffmpeg segment extraction failed", exc_info=True)
                return None, None, None
            if not wav_bytes:
                return None, None, None
            shazam = Shazam(wav_bytes)
            try:
                res = next(shazam.recognizeSong(), None)
                if res and len(res) > 1 and 'track' in res[1]:
                    track = res[1]['track']
                    artist = track.get('subtitle', 'Unknown')
                    title = track.get('title', 'Unknown')
                    return f"{artist} - {title}", artist, title
            except Exception:
                logger.debug("set_analyzer: Shazam recognition failed for segment", exc_info=True)
            return None, None, None

        def _format_timestamp(seconds: float) -> str:
            s = int(seconds)
            return f"{s // 60}:{s % 60:02d}"

        async def _refine_boundary(result_index: int, window_start: float, window_end: float, target_key: str):
            """Binary-search the true transition point within the coarse
            [window_start, window_end) interval-window down to ~10-15s precision,
            using a couple of extra Shazam probes. Runs after the main scan so it
            never slows down track discovery itself."""
            async with refinement_sem:
                lo, hi = window_start, window_end
                for _ in range(2):
                    if hi - lo <= 12:
                        break
                    mid = lo + (hi - lo) / 2
                    current_track, _, _ = await asyncio.to_thread(_shazam_segment, mid)
                    if current_track == target_key:
                        hi = mid
                    else:
                        lo = mid
                if result_index < len(results):
                    results[result_index]["timestamp"] = _format_timestamp(hi)

        async def _confirm(artist, title, timestamp, window=None, target_key=None):
            """Append a confirmed track (deduping the same recording seen back-to-back)."""
            nonlocal last_confirmed
            info = {
                "artist": artist or "Unknown",
                "title": title or "Unknown",
                "timestamp": timestamp,
                "matched_track": await match_tidal_track(artist or "", title or ""),
            }
            if results and _dedupe_key(results[-1]["artist"], results[-1]["title"]) == _dedupe_key(info["artist"], info["title"]):
                # Same recording as the previous confirmed row (e.g. Extended Mix
                # right after the original) — keep the earlier one, upgrade its match.
                if not results[-1].get("matched_track") and info["matched_track"]:
                    results[-1]["matched_track"] = info["matched_track"]
                return
            results.append(info)
            job_state.update_set_tracks(job_id, results)
            if window is not None and target_key is not None:
                idx = len(results) - 1
                refinement_tasks.append(
                    asyncio.create_task(_refine_boundary(idx, window[0], window[1], target_key))
                )

        # Recognize segments in ordered batches: Shazam calls within a batch run
        # concurrently (network-bound), but confirmation stays sequential so the
        # 2-consecutive-detection rule and progressive result list are preserved.
        for batch_start in range(0, total_segments, SHAZAM_CONCURRENCY):
            if job_state.is_cancelled(job_id):
                return {"ok": False, "error": "cancelled", "count": len(results)}

            batch = list(range(batch_start, min(batch_start + SHAZAM_CONCURRENCY, total_segments)))
            detections = await asyncio.gather(
                *[asyncio.to_thread(_shazam_segment, j * interval) for j in batch]
            )

            for j, (current_track, current_artist, current_title) in zip(batch, detections):
                start_ms = j * interval * 1000
                timestamp = f"{start_ms // 60000}:{(start_ms // 1000) % 60:02d}"
                if current_track:
                    if current_track == last_confirmed:
                        pass
                    elif current_track == pending_track:
                        window = (max(0, (pending_seg_idx - 1) * interval), pending_seg_idx * interval)
                        await _confirm(
                            current_artist, current_title or pending_track, pending_timestamp,
                            window=window, target_key=pending_track,
                        )
                        last_confirmed = current_track
                        pending_track = None
                        pending_seg_idx = None
                    else:
                        pending_track = current_track
                        pending_timestamp = timestamp
                        pending_seg_idx = j
                else:
                    pending_track = None
                    pending_seg_idx = None

            done = min(batch_start + SHAZAM_CONCURRENCY, total_segments)
            pct = int((done / max(total_segments, 1)) * 100)
            job_state.update_analysis(
                job_id,
                phase="scan",
                percent=20 + int(pct * 0.75),
                label=f"Analyzing… {pct}%",
                segments_done=done,
                segments_total=total_segments,
                tracks_found=len(results),
            )

        if pending_track and pending_track != last_confirmed:
            await _confirm("Unknown", pending_track, pending_timestamp)

        if refinement_tasks:
            job_state.update_analysis(
                job_id,
                phase="scan",
                percent=97,
                label="Refining timestamps…",
                segments_done=total_segments,
                segments_total=total_segments,
                tracks_found=len(results),
            )
            await asyncio.gather(*refinement_tasks, return_exceptions=True)
            job_state.update_set_tracks(job_id, results)

        job_state.update_analysis(
            job_id,
            phase="done",
            percent=100,
            label="Analysis complete",
            segments_done=total_segments,
            segments_total=total_segments,
            tracks_found=len(results),
        )
        job_state.mark_done(job_id)
        return {"ok": True, "count": len(results)}
