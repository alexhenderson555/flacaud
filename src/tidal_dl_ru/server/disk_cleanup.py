"""Sweep stale job dirs and stream-cache files to free disk."""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)


def _dir_size(path: Path) -> int:
    total = 0
    try:
        for child in path.rglob("*"):
            if child.is_file():
                try:
                    total += child.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _prune_old_files(root: Path, *, max_age_sec: int, label: str) -> tuple[int, int]:
    removed = 0
    freed = 0
    if not root.is_dir():
        return removed, freed
    cutoff = time.time() - max_age_sec
    for path in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        try:
            st = path.stat()
        except OSError:
            continue
        if st.st_mtime >= cutoff:
            continue
        try:
            if path.is_file():
                freed += st.st_size
                path.unlink(missing_ok=True)
                removed += 1
            elif path.is_dir() and not any(path.iterdir()):
                path.rmdir()
                removed += 1
        except OSError as exc:
            logger.debug("disk_cleanup skip %s: %s", path, exc)
    if removed:
        logger.info("disk_cleanup %s removed=%s freed_mb=%.1f", label, removed, freed / 1_048_576)
    return removed, freed


def _prune_job_dirs(jobs_dir: Path, *, max_age_sec: int) -> tuple[int, int]:
    removed = 0
    freed = 0
    if not jobs_dir.is_dir():
        return removed, freed
    cutoff = time.time() - max_age_sec
    registry_path = jobs_dir / "downloaded_tracks.json"
    for entry in jobs_dir.iterdir():
        if not entry.is_dir():
            continue
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
        except OSError:
            continue
        size = _dir_size(entry)
        try:
            shutil.rmtree(entry)
            removed += 1
            freed += size
        except OSError as exc:
            logger.warning("disk_cleanup job_dir %s: %s", entry, exc)
    if registry_path.is_file() and removed:
        # Delegate to jobs.py, which owns the registry's lock + atomic-write
        # pattern -- this used to read/mutate/write the same file directly
        # with no lock, racing a concurrent mark_downloaded() and risking
        # silently dropping a just-completed download's entry (or, on a
        # crash mid-write, truncating the whole registry).
        from tidal_dl_ru.server.jobs import prune_missing_registry_entries

        prune_missing_registry_entries(jobs_dir)
    return removed, freed


def _enforce_stream_cache_cap(cache_dir: Path, *, max_bytes: int) -> tuple[int, int]:
    if max_bytes <= 0 or not cache_dir.is_dir():
        return 0, 0
    files: list[tuple[float, Path, int]] = []
    total = 0
    for path in cache_dir.rglob("*"):
        if not path.is_file():
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        files.append((st.st_mtime, path, st.st_size))
        total += st.st_size
    if total <= max_bytes:
        return 0, 0
    files.sort(key=lambda row: row[0])
    removed = 0
    freed = 0
    for _, path, size in files:
        if total <= max_bytes:
            break
        try:
            path.unlink(missing_ok=True)
            total -= size
            freed += size
            removed += 1
        except OSError:
            pass
    return removed, freed


def run_disk_cleanup() -> dict:
    """Delete expired job dirs and stream-cache blobs; return stats."""
    job_ttl = settings.job_ttl_seconds
    file_ttl = settings.file_url_ttl_seconds
    cache_cap = settings.stream_cache_max_bytes

    jobs_removed, jobs_freed = _prune_job_dirs(settings.jobs_dir, max_age_sec=job_ttl)
    cache_removed, cache_freed = _prune_old_files(
        settings.stream_cache_dir,
        max_age_sec=file_ttl,
        label="stream_cache",
    )
    cap_removed, cap_freed = _enforce_stream_cache_cap(
        settings.stream_cache_dir,
        max_bytes=cache_cap,
    )

    # Set-audio cache: large full-mix downloads kept only for re-analysis. Expire by
    # age, then enforce a size cap (LRU) so it can't grow without bound.
    set_removed, set_freed = _prune_old_files(
        settings.set_audio_cache_dir,
        max_age_sec=settings.set_audio_cache_ttl_seconds,
        label="set_audio_cache",
    )
    set_cap_removed, set_cap_freed = _enforce_stream_cache_cap(
        settings.set_audio_cache_dir,
        max_bytes=settings.set_audio_cache_max_bytes,
    )

    stats = {
        "jobs_dirs_removed": jobs_removed,
        "stream_files_removed": cache_removed + cap_removed,
        "set_audio_files_removed": set_removed + set_cap_removed,
        "bytes_freed": (
            jobs_freed + cache_freed + cap_freed + set_freed + set_cap_freed
        ),
    }
    logger.info("disk_cleanup done %s", stats)
    return stats


async def disk_cleanup_task(_ctx: dict) -> dict:
    """ARQ cron entrypoint."""
    from tidal_dl_ru.server.metrics import record_disk_cleanup

    stats = run_disk_cleanup()
    record_disk_cleanup(stats)
    return stats
