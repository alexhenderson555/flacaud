"""ARQ worker. Each task takes a URL → expands via router → downloads each
track → updates Redis-backed job state.

The provider stack is sync (httpx, yt-dlp). We run each download inside
`asyncio.to_thread` so the ARQ event loop stays responsive and multiple jobs
can run concurrently (bounded by Settings.arq_max_jobs).
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Optional

import httpx
from arq.connections import RedisSettings

from tidal_dl_ru.core.lyrics import fetch_synced_lrc, write_sidecar
from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.core.router import find_provider
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import sign_file
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.tagging import tag_file

_INVALID_FN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe(s: str, max_len: int = 120) -> str:
    out = _INVALID_FN.sub("_", s).strip().rstrip(". ")
    return out[:max_len] or "_"


def _filename(track: Track) -> str:
    return _safe(
        f"{track.track_number:02d} - {track.primary_artist} - {track.title}"
    )


def _album_subdir(track: Track) -> str:
    if not track.album:
        return _safe(f"_Singles ({track.provider})")
    artist = track.album_artist or track.primary_artist
    base = f"{artist} - {track.album}"
    if track.year:
        base += f" ({track.year})"
    return _safe(base)


def _download_sync(
    job_id: str,
    idx: int,
    track: Track,
    quality: Quality,
    lyrics: bool,
    job_dir: Path,
    karaoke: bool = False,
    dj_analyze: bool = False,
) -> Optional[Path]:
    provider = find_provider(track.source_url or "")
    if provider is None:
        # Fallback: re-find via provider name. Universal Track records its
        # provider field, so look it up explicitly.
        from tidal_dl_ru.core.router import get_provider_by_name

        provider = get_provider_by_name(track.provider)
    if provider is None:
        job_state.update_track(
            job_id, idx, status="failed", error="no provider matches track"
        )
        return None

    album_dir = job_dir / _album_subdir(track)
    base = album_dir / _filename(track)

    def cb(written: int, total: Optional[int]) -> None:
        job_state.update_track(
            job_id, idx, status="downloading", bytes_written=written, bytes_total=total
        )

    try:
        path = provider.download(track, base, quality, on_progress=cb)
    except ProviderError as e:
        job_state.update_track(job_id, idx, status="skipped", error=str(e))
        return None
    except Exception as e:  # noqa: BLE001 — surface unknown provider errors
        job_state.update_track(
            job_id, idx, status="failed", error=f"{type(e).__name__}: {e}"
        )
        return None

    # Tag + lyrics (best-effort)
    http = httpx.Client(timeout=60.0, follow_redirects=True)
    try:
        lrc = fetch_synced_lrc(track) if lyrics else None
        tag_file(path, track, http, lyrics=lrc)
        if lrc:
            write_sidecar(lrc, path)
        # Karaoke: translate LRC to Russian.
        if karaoke and lrc:
            import asyncio as _asyncio
            from tidal_dl_ru.core.translate import translate_lrc_to_file
            try:
                _asyncio.run(translate_lrc_to_file(lrc, path))
            except Exception:
                pass
        # DJ analysis: BPM + key detection.
        if dj_analyze:
            from tidal_dl_ru.core.dj import analyze_and_tag
            try:
                analyze_and_tag(path)
            except Exception:
                pass
    finally:
        http.close()

    rel_path = str(path.relative_to(settings.jobs_dir)).replace("\\", "/")
    token = sign_file(job_id, str(path.relative_to(job_dir)).replace("\\", "/"))
    job_state.update_track(
        job_id,
        idx,
        status="done",
        bytes_written=path.stat().st_size,
        bytes_total=path.stat().st_size,
        file_token=token,
    )
    job_state.mark_downloaded(track.provider_id, rel_path)
    return path


async def download_url(
    ctx: dict,
    job_id: str,
    url: str,
    quality: str,
    lyrics: bool,
    karaoke: bool = False,
    dj_analyze: bool = False,
    match_tidal: bool = False,
    split: bool = False,
) -> dict:
    """ARQ task: fetch URL → produce files. Updates job state in Redis as it goes."""
    try:
        provider = find_provider(url)
        if provider is None:
            job_state.mark_failed(job_id, "No provider matches this URL.")
            return {"ok": False, "error": "no provider"}

        tracks = await asyncio.to_thread(provider.expand, url)
        if not tracks:
            job_state.mark_failed(job_id, "Nothing resolved from URL.")
            return {"ok": False, "error": "empty"}

        if match_tidal:
            from tidal_dl_ru.core.router import get_provider_by_name
            tidal_p = get_provider_by_name("tidal")
            if tidal_p:
                matched = []
                for t in tracks:
                    query = f"{t.artists[0]} {t.title}".strip()
                    try:
                        res = await asyncio.to_thread(tidal_p.search, query, 1)
                        if res:
                            matched.append(res[0])
                    except Exception:
                        pass
                tracks = matched
            if not tracks:
                job_state.mark_failed(job_id, "Could not match any tracks on Tidal.")
                return {"ok": False, "error": "match_failed"}

        if split:
            track = tracks[0]
            job_state.mark_running(job_id, 2, [f"Vocals: {track.title}", f"Instrumental: {track.title}"])
            job_dir = settings.jobs_dir / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            q = Quality(quality)
            
            import uuid
            from tidal_dl_ru.core.split import split_audio_demucs
            
            # Download the track first
            job_state.update_track(job_id, 0, status="downloading")
            job_state.update_track(job_id, 1, status="downloading")
            
            base = job_dir / _filename(track)
            try:
                path = await asyncio.to_thread(provider.download, track, base, q)
                if not path:
                    raise Exception("Failed to download track for splitting")
            except Exception as e:
                job_state.update_track(job_id, 0, status="failed", error=str(e))
                job_state.update_track(job_id, 1, status="failed", error=str(e))
                job_state.mark_failed(job_id, str(e))
                return {"ok": False, "error": str(e)}

            # Split it
            try:
                res = await split_audio_demucs(str(path), str(job_dir))
                
                # Sign and register files
                v_path = Path(res.vocals_path)
                i_path = Path(res.instrumental_path)
                
                v_token = sign_file(job_id, str(v_path.relative_to(job_dir)).replace("\\", "/"))
                i_token = sign_file(job_id, str(i_path.relative_to(job_dir)).replace("\\", "/"))
                
                job_state.update_track(job_id, 0, status="done", bytes_written=v_path.stat().st_size, bytes_total=v_path.stat().st_size, file_token=v_token)
                job_state.update_track(job_id, 1, status="done", bytes_written=i_path.stat().st_size, bytes_total=i_path.stat().st_size, file_token=i_token)
            except Exception as e:
                job_state.update_track(job_id, 0, status="failed", error=str(e))
                job_state.update_track(job_id, 1, status="failed", error=str(e))
                job_state.mark_failed(job_id, str(e))
                return {"ok": False, "error": str(e)}

            job_state.mark_done(job_id)
            return {"ok": True, "count": 2}
        else:
            job_state.mark_running(job_id, len(tracks), [t.title for t in tracks])

            job_dir = settings.jobs_dir / job_id
            job_dir.mkdir(parents=True, exist_ok=True)

            q = Quality(quality)
            for idx, track in enumerate(tracks):
                await asyncio.to_thread(
                    _download_sync, job_id, idx, track, q, lyrics, job_dir,
                    karaoke=karaoke, dj_analyze=dj_analyze,
                )

            job_state.mark_done(job_id)
            return {"ok": True, "count": len(tracks)}
    except Exception as e:  # noqa: BLE001
        job_state.mark_failed(job_id, f"{type(e).__name__}: {e}")
        raise


async def analyze_set(ctx: dict, job_id: str, url: str) -> dict:
    from tidal_dl_ru.core.set_analyzer import analyze_set_task
    return await analyze_set_task(job_id, url)


class WorkerSettings:
    """Run with: `arq tidal_dl_ru.server.worker.WorkerSettings`"""

    functions = [download_url, analyze_set]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.arq_max_jobs
    job_timeout = 60 * 60  # 1 hour for big albums
    keep_result = 86400


