import asyncio
import io
import logging
import os
import tempfile

from tidal_dl_ru.core.set_track_match import clean_title_for_query, dedupe_key, match_tidal_track
from tidal_dl_ru.server import jobs as job_state

logger = logging.getLogger(__name__)

# How many segments to recognize concurrently. Shazam calls are network-bound, so
# batching them cuts scan wall-time ~N× while a modest cap avoids hammering the API.
SHAZAM_CONCURRENCY = 6

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


async def analyze_set_task(
    job_id: str,
    url: str,
    interval: int = 30
) -> dict:
    import yt_dlp
    from pydub import AudioSegment
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

        def _download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)

        try:
            await asyncio.to_thread(_download)
        except Exception as e:
            if job_state.is_cancelled(job_id):
                return {"ok": False, "error": "cancelled"}
            job_state.mark_failed(job_id, f"Failed to download audio: {e}")
            job_state.update_analysis(
                job_id,
                phase="failed",
                percent=0,
                label=f"Failed to download audio: {e}",
            )
            return {"ok": False, "error": str(e)}

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
            label="Loading audio…",
        )

        try:
            def _load_audio():
                return AudioSegment.from_mp3(audio_file)
            audio = await asyncio.to_thread(_load_audio)
        except Exception as e:
            job_state.mark_failed(job_id, f"Failed to load audio: {e}")
            job_state.update_analysis(
                job_id,
                phase="failed",
                percent=0,
                label=f"Failed to load audio: {e}",
            )
            return {"ok": False, "error": str(e)}

        total_segments = len(audio) // (interval * 1000)
        last_confirmed = None
        pending_track = None
        pending_timestamp = None

        job_state.update_analysis(
            job_id,
            phase="scan",
            percent=20,
            label="Analyzing… 0%",
            segments_done=0,
            segments_total=total_segments,
        )

        def _shazam_segment(seg):
            buffer = io.BytesIO()
            seg.export(buffer, format='wav')
            wav_bytes = buffer.getvalue()
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

        async def _confirm(artist, title, timestamp):
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

        # Recognize segments in ordered batches: Shazam calls within a batch run
        # concurrently (network-bound), but confirmation stays sequential so the
        # 2-consecutive-detection rule and progressive result list are preserved.
        for batch_start in range(0, total_segments, SHAZAM_CONCURRENCY):
            if job_state.is_cancelled(job_id):
                return {"ok": False, "error": "cancelled", "count": len(results)}

            batch = list(range(batch_start, min(batch_start + SHAZAM_CONCURRENCY, total_segments)))
            segments = [audio[j * interval * 1000: j * interval * 1000 + 10000] for j in batch]
            detections = await asyncio.gather(
                *[asyncio.to_thread(_shazam_segment, seg) for seg in segments]
            )

            for j, (current_track, current_artist, current_title) in zip(batch, detections):
                start_ms = j * interval * 1000
                timestamp = f"{start_ms // 60000}:{(start_ms // 1000) % 60:02d}"
                if current_track:
                    if current_track == last_confirmed:
                        pass
                    elif current_track == pending_track:
                        await _confirm(current_artist, current_title or pending_track, pending_timestamp)
                        last_confirmed = current_track
                        pending_track = None
                    else:
                        pending_track = current_track
                        pending_timestamp = timestamp
                else:
                    pending_track = None

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
