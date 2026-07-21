"""ARQ worker. Each task takes a URL → expands via router → downloads each
track → updates Redis-backed job state.

The provider stack is sync (httpx, yt-dlp). We run each download inside
`asyncio.to_thread` so the ARQ event loop stays responsive and multiple jobs
can run concurrently (bounded by Settings.arq_max_jobs).
"""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

from tidal_dl_ru.logging_config import configure_logging

configure_logging("worker")
log = logging.getLogger(__name__)

import httpx
from arq import cron
from arq.connections import RedisSettings

from tidal_dl_ru.core.lyrics import fetch_synced_lrc, write_sidecar
from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.core.router import find_provider
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.disk_cleanup import disk_cleanup_task
from tidal_dl_ru.server.files import sign_file
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.server.subscription_lifecycle import expire_due_subscriptions
from tidal_dl_ru.server.subscription_notify import notify_expiring_subscriptions
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
        if job_state.is_cancelled(job_id):
            raise RuntimeError("Job cancelled by user or timeout.")
        job_state.update_track(
            job_id, idx, status="downloading", bytes_written=written, bytes_total=total
        )

    try:
        path = provider.download(track, base, quality, on_progress=cb)
    except ProviderError as e:
        job_state.update_track(job_id, idx, status="skipped", error=str(e))
        return None
    except (OSError, httpx.HTTPError, ValueError, RuntimeError) as e:
        job_state.update_track(
            job_id, idx, status="failed", error=f"{type(e).__name__}: {e}"
        )
        return None

    # Tags + cover always; synced lyrics/LRC sidecar only when lyrics=True (slow).
    job_state.update_track(job_id, idx, status="tagging")
    http = httpx.Client(timeout=60.0, follow_redirects=True)
    try:
        lrc = fetch_synced_lrc(track) if lyrics else None
        tag_file(path, track, http, lyrics=lrc)
        if lrc:
            write_sidecar(lrc, path)
        if karaoke and lrc:
            import asyncio as _asyncio

            from tidal_dl_ru.core.translate import translate_lrc_to_file
            try:
                _asyncio.run(translate_lrc_to_file(lrc, path))
            except (httpx.HTTPError, OSError, ValueError, RuntimeError):
                pass
        if dj_analyze:
            from tidal_dl_ru.core.dj import analyze_and_tag
            try:
                analyze_and_tag(path)
            except (OSError, ValueError, RuntimeError):
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
    requested = quality.value if hasattr(quality, "value") else str(quality)
    delivered = job_state.infer_delivered_ui_quality(path, requested)
    job_state.set_job_quality(job_id, delivered)
    job_status = job_state.load(job_id)
    job_state.mark_downloaded(
        track.provider_id,
        rel_path,
        title=track.title,
        artist=track.artists[0] if track.artists else None,
        quality=delivered,
        job_id=job_id,
        owner_id=job_status.owner_id if job_status else None,
    )
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
) -> dict:
    """ARQ task: fetch URL → produce files. Updates job state in Redis as it goes."""
    log.info(
        "job_start job_id=%s quality=%s url=%s",
        job_id,
        quality,
        url[:200],
        extra={"event": "job_start", "job_id": job_id},
    )
    try:
        from tidal_dl_ru.core.transfer_router import find_transfer_provider

        provider = find_transfer_provider(url)
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
                    except (ProviderError, httpx.HTTPError, ValueError):
                        pass
                tracks = matched
            if not tracks:
                job_state.mark_failed(job_id, "Could not match any tracks on Tidal.")
                return {"ok": False, "error": "match_failed"}

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
        log.info("job_done job_id=%s tracks=%s", job_id, len(tracks), extra={"event": "job_done", "job_id": job_id})
        return {"ok": True, "count": len(tracks)}
    except Exception as e:  # noqa: BLE001
        log.exception("job_failed job_id=%s error=%s", job_id, e, extra={"event": "job_failed", "job_id": job_id})
        job_state.mark_failed(job_id, f"{type(e).__name__}: {e}")
        raise


async def analyze_set(ctx: dict, job_id: str, url: str) -> dict:
    log.info("analyze_set_start job_id=%s", job_id, extra={"event": "analyze_set_start", "job_id": job_id})
    from tidal_dl_ru.core.set_analyzer import analyze_set_task

    try:
        return await analyze_set_task(job_id, url)
    except Exception as e:
        status = job_state.load(job_id)
        if status and status.set_tracks:
            n = len(status.set_tracks)
            job_state.update_analysis(
                job_id,
                phase="done",
                percent=100,
                label=f"Partial result ({n} tracks): {e}",
                tracks_found=n,
            )
            job_state.mark_done(job_id)
            log.warning(
                "analyze_set_partial job_id=%s tracks=%s error=%s",
                job_id,
                n,
                e,
                extra={"event": "analyze_set_partial", "job_id": job_id},
            )
            return {"ok": True, "count": n, "partial": True}
        job_state.mark_failed(job_id, f"{type(e).__name__}: {e}")
        raise


async def download_set_audio(ctx: dict, job_id: str, url: str) -> dict:
    log.info(
        "download_set_audio_start job_id=%s", job_id,
        extra={"event": "download_set_audio_start", "job_id": job_id},
    )
    from tidal_dl_ru.core.set_analyzer import download_set_audio_task

    try:
        return await download_set_audio_task(job_id, url)
    except Exception as e:
        job_state.mark_failed(job_id, f"{type(e).__name__}: {e}")
        raise


async def subscription_expiry_notify(ctx) -> dict:
    count = await asyncio.to_thread(notify_expiring_subscriptions)
    return {"sent": count}


async def subscription_expire_due(ctx) -> dict:
    count = await asyncio.to_thread(expire_due_subscriptions)
    return {"expired": count}


class WorkerSettings:
    """Run with: `arq tidal_dl_ru.server.worker.WorkerSettings`"""

    functions = [
        download_url, analyze_set, download_set_audio,
        subscription_expiry_notify, subscription_expire_due,
    ]
    cron_jobs = [
        cron(disk_cleanup_task, hour={3, 15}, minute=0),  # type: ignore[arg-type]
        cron(subscription_expiry_notify, hour={10}, minute=0),
        cron(subscription_expire_due, hour={4}, minute=30),
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.arq_max_jobs
    job_timeout = 60 * 60  # 1 hour for big albums
    keep_result = 86400


