"""Job state persisted in Redis.

Single hash per job. Stored as JSON in the `state` field; updated by the worker
and read by the API. Convenient because we have <500 tracks per job — JSON
overhead is fine.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import redis
from filelock import FileLock, Timeout

from tidal_dl_ru.server.schemas import AnalysisProgress, JobStatus, TrackProgress
from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)


def _client() -> redis.Redis:
    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    r.ping()
    return r


def new_job_id() -> str:
    return uuid.uuid4().hex[:16]


def _key(job_id: str) -> str:
    return f"tidaldl:job:{job_id}"


def create(
    job_id: str,
    provider: Optional[str] = None,
    job_type: str = "download",
    quality: Optional[str] = None,
    owner_id: Optional[int] = None,
) -> JobStatus:
    now = time.time()
    status = JobStatus(
        job_id=job_id,
        owner_id=owner_id,
        job_type=job_type,
        status="queued",
        provider=provider,
        quality=quality,
        created_at=now,
        updated_at=now,
    )
    save(status)
    return status


def save(status: JobStatus) -> None:
    status.updated_at = time.time()
    r = _client()
    r.set(_key(status.job_id), status.model_dump_json(), ex=settings.job_ttl_seconds)


def load(job_id: str) -> Optional[JobStatus]:
    r = _client()
    raw = r.get(_key(job_id))
    if raw is None:
        return None
    return JobStatus.model_validate(json.loads(raw))  # type: ignore[arg-type]


def set_job_quality(job_id: str, quality: str) -> None:
    status = load(job_id)
    if status is None:
        return
    status.quality = quality
    save(status)


def infer_delivered_ui_quality(path: Path, requested: str | None) -> str:
    """Map on-disk file to UI tier (m4a ⇒ 320k even if job asked for MAX)."""
    ext = path.suffix.lower()
    if ext in (".m4a", ".mp3"):
        return "HIGH"
    if ext == ".flac":
        req = (requested or "").upper()
        if req in ("HI_RES", "HI_RES_LOSSLESS"):
            return "HI_RES"
        return "LOSSLESS"
    return normalize_request_quality(requested or "HIGH") or "HIGH"


def update_track(
    job_id: str,
    idx: int,
    **changes,
) -> None:
    """Atomic-ish update of a single track's fields. Single-writer model: only
    the worker for this job mutates state, so RMW is safe."""
    status = load(job_id)
    if status is None:
        return
    while len(status.tracks) <= idx:
        status.tracks.append(TrackProgress(title="", status="queued"))
    t = status.tracks[idx]
    for k, v in changes.items():
        setattr(t, k, v)
    # Aggregate counters
    status.done_tracks = sum(1 for x in status.tracks if x.status == "done")
    status.failed_tracks = sum(
        1 for x in status.tracks if x.status in ("failed", "skipped")
    )
    save(status)


def update_analysis(
    job_id: str,
    *,
    phase: str,
    percent: int,
    label: str,
    segments_done: int = 0,
    segments_total: int = 0,
    tracks_found: int | None = None,
) -> None:
    """Structured analyze_set progress for the SPA (phase, %, segment counters)."""
    status = load(job_id)
    if status is None:
        return
    if phase not in ("done", "failed"):
        status.status = "running"
    found = tracks_found if tracks_found is not None else len(status.set_tracks)
    status.analysis = AnalysisProgress(
        phase=phase,
        percent=max(0, min(100, int(percent))),
        segments_done=max(0, int(segments_done)),
        segments_total=max(0, int(segments_total)),
        tracks_found=max(0, int(found)),
        label=label or "",
    )
    track_status = "downloading" if phase == "download" else "queued"
    status.tracks = [TrackProgress(title=label or phase, status=track_status)]
    save(status)


def mark_running(job_id: str, total_tracks: int, titles: list[str]) -> None:
    status = load(job_id)
    if status is None:
        return
    status.status = "running"
    status.total_tracks = total_tracks
    status.tracks = [TrackProgress(title=t, status="queued") for t in titles]
    save(status)


def update_set_tracks(job_id: str, set_tracks: list[dict]) -> None:
    from tidal_dl_ru.server.schemas import SetTrackInfo
    status = load(job_id)
    if status is None:
        return
    # Convert dicts to SetTrackInfo objects if they aren't already
    parsed = []
    for item in set_tracks:
        if isinstance(item, dict):
            parsed.append(SetTrackInfo(**item))
        else:
            parsed.append(item)
    status.set_tracks = parsed
    n = len(parsed)
    if n > 0 and status.analysis is not None and status.analysis.phase in ("download", "process"):
        status.analysis.phase = "scan"
        status.analysis.tracks_found = max(status.analysis.tracks_found, n)
    save(status)


def mark_done(job_id: str) -> None:
    status = load(job_id)
    if status is None:
        return
    # analyze_set jobs keep total_tracks=0; 0==0 must not mark them failed.
    status.status = (
        "failed"
        if status.total_tracks > 0 and status.failed_tracks == status.total_tracks
        else "done"
    )
    save(status)


def mark_failed(job_id: str, error: str) -> None:
    status = load(job_id)
    if status is None:
        return
    status.status = "failed"
    if status.tracks:
        status.tracks[0].error = error
    if status.analysis is not None:
        status.analysis.phase = "failed"
        status.analysis.label = error
    save(status)


def is_cancelled(job_id: str) -> bool:
    status = load(job_id)
    return status is not None and status.status == "cancelled"


def mark_cancelled(job_id: str, reason: str = "Cancelled by user") -> bool:
    """Mark a queued/running job as cancelled. Returns False if not cancellable."""
    status = load(job_id)
    if status is None:
        return False
    if status.status in ("done", "failed", "cancelled"):
        return False
    status.status = "cancelled"
    status.analysis = AnalysisProgress(
        phase="failed",
        percent=status.analysis.percent if status.analysis else 0,
        segments_done=status.analysis.segments_done if status.analysis else 0,
        segments_total=status.analysis.segments_total if status.analysis else 0,
        tracks_found=len(status.set_tracks),
        label=reason,
    )
    if status.tracks:
        status.tracks[0].error = reason
    else:
        status.tracks = [TrackProgress(title=reason, status="failed", error=reason)]
    save(status)
    return True


_registry_path = settings.jobs_dir / "downloaded_tracks.json"
# Serializes the read-modify-write below across concurrent worker processes.
_registry_lock = FileLock(str(settings.jobs_dir / "downloaded_tracks.json.lock"))

def _load_registry() -> dict[str, str | dict]:
    if not _registry_path.exists():
        return {}
    try:
        with open(_registry_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def registry_rel_path(value: str | dict) -> str:
    """Normalize registry entry (legacy str path or metadata dict)."""
    if isinstance(value, dict):
        return str(value.get("path") or value.get("rel_path") or "")
    return str(value or "")


def normalize_registry_quality(q: str | None) -> str | None:
    """Map stored job quality to UI stream tier (HIGH / LOSSLESS / HI_RES)."""
    if not q:
        return None
    u = str(q).upper()
    if u in ("HI_RES", "HI_RES_LOSSLESS"):
        return "HI_RES"
    if u == "LOSSLESS":
        return "LOSSLESS"
    if u in ("HIGH", "LOW"):
        return "HIGH"
    return None


def normalize_request_quality(quality: str) -> str:
    u = (quality or "HIGH").upper()
    if u in ("HI_RES", "HI_RES_LOSSLESS"):
        return "HI_RES"
    if u == "LOSSLESS":
        return "LOSSLESS"
    return "HIGH"


def registry_file_for_quality(
    registry: dict[str, str | dict],
    track_id: str,
    quality: str,
) -> Path | None:
    """On-server download path only when stored tier matches the requested stream tier."""
    entry = registry.get(track_id)
    if entry is None:
        return None
    # Legacy path-only entries: quality unknown — don't shortcut the stream URL.
    if isinstance(entry, str):
        return None
    file_q = normalize_registry_quality(entry.get("quality") if isinstance(entry, dict) else None)
    if not file_q or file_q != normalize_request_quality(quality):
        return None
    rel = registry_rel_path(entry)
    if not rel:
        return None
    full_path = settings.jobs_dir / rel
    return full_path if full_path.exists() else None


def get_downloaded_registry() -> dict[str, str | dict]:
    return _load_registry()


def get_downloaded_registry_for_owner(owner_id: int) -> dict[str, str | dict]:
    """User-scoped view of the download registry (API only)."""
    registry = _load_registry()
    out: dict[str, str | dict] = {}
    for track_id, entry in registry.items():
        if isinstance(entry, dict):
            entry_owner = entry.get("owner_id")
            if entry_owner is not None and int(entry_owner) != int(owner_id):
                continue
            if entry_owner is None:
                continue
        else:
            continue
        out[track_id] = entry
    return out


def mark_downloaded(
    provider_id: str,
    relative_path: str,
    *,
    title: str | None = None,
    artist: str | None = None,
    quality: str | None = None,
    job_id: str | None = None,
    owner_id: int | None = None,
) -> None:
    _registry_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "path": relative_path,
        "title": title or "",
        "artist": artist or "",
        "quality": quality or "",
        "job_id": job_id or "",
        "owner_id": owner_id,
        "at": time.time(),
    }
    try:
        # Lock the whole read-modify-write so concurrent workers don't clobber
        # each other; write to a temp file + atomic replace so readers (which
        # don't lock) never see a half-written file.
        with _registry_lock.acquire(timeout=10):
            registry = _load_registry()
            registry[provider_id] = entry
            tmp = _registry_path.with_name(_registry_path.name + ".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(registry, f, ensure_ascii=False, indent=2)
            os.replace(tmp, _registry_path)
    except Timeout:
        logger.warning("registry lock busy; skipped mark_downloaded for %s", provider_id)
    except Exception as e:
        logger.warning("Failed to save registry: %s", e)


def prune_missing_registry_entries(jobs_dir: Path) -> bool:
    """Drop registry entries whose backing file no longer exists (e.g. after
    disk_cleanup deletes a stale job dir). Returns True if the registry changed.

    Uses the same lock + atomic-write pattern as mark_downloaded -- this used
    to be duplicated in disk_cleanup.py as a plain read_text/write_text with
    no lock at all, racing mark_downloaded's own locked read-modify-write: a
    download completing (and locking, reading, adding its entry, writing)
    at the same moment cleanup read its own stale copy, mutated it, and wrote
    it back unlocked would silently overwrite -- and drop -- the just-added
    entry. A crash mid-write_text (no temp file) could also leave the JSON
    truncated, which _load_registry's bare `except: return {}` would then
    treat as "empty registry", losing the entire download history.
    """
    try:
        with _registry_lock.acquire(timeout=10):
            registry = _load_registry()
            changed = False
            for track_id, entry in list(registry.items()):
                rel = registry_rel_path(entry)
                if not rel or not (jobs_dir / rel).exists():
                    registry.pop(track_id, None)
                    changed = True
            if changed:
                tmp = _registry_path.with_name(_registry_path.name + ".tmp")
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(registry, f, ensure_ascii=False, indent=2)
                os.replace(tmp, _registry_path)
            return changed
    except Timeout:
        logger.warning("registry lock busy; skipped prune_missing_registry_entries")
        return False
    except Exception as e:
        logger.warning("Failed to prune registry: %s", e)
        return False


def list_jobs_for_owner(owner_id: int, *, limit: int = 40) -> list[JobStatus]:
    """Recent download jobs for a user (Redis SCAN)."""
    r = _client()
    found: list[JobStatus] = []
    cursor = 0
    while True:
        cursor, keys = r.scan(cursor, match="tidaldl:job:*", count=200)  # type: ignore[misc]
        for key in keys:
            raw = r.get(key)
            if not raw:
                continue
            try:
                status = JobStatus.model_validate(json.loads(raw))  # type: ignore[arg-type]
            except Exception:
                continue
            if status.owner_id == owner_id and status.job_type == "download":
                found.append(status)
        if cursor == 0:
            break
    found.sort(key=lambda s: s.updated_at, reverse=True)
    return found[:limit]
