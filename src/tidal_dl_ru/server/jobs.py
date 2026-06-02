"""Job state persisted in Redis.

Single hash per job. Stored as JSON in the `state` field; updated by the worker
and read by the API. Convenient because we have <500 tracks per job — JSON
overhead is fine.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Optional

import redis

from tidal_dl_ru.server.schemas import JobStatus, TrackProgress
from tidal_dl_ru.server.settings import settings


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
    return JobStatus.model_validate(json.loads(raw))


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
    save(status)


def mark_done(job_id: str) -> None:
    status = load(job_id)
    if status is None:
        return
    status.status = "failed" if status.failed_tracks == status.total_tracks else "done"
    save(status)


def mark_failed(job_id: str, error: str) -> None:
    status = load(job_id)
    if status is None:
        return
    status.status = "failed"
    if status.tracks:
        status.tracks[0].error = error
    save(status)


_registry_path = settings.jobs_dir / "downloaded_tracks.json"

def _load_registry() -> dict[str, str]:
    if not _registry_path.exists():
        return {}
    try:
        with open(_registry_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def mark_downloaded(provider_id: str, relative_path: str) -> None:
    _registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry = _load_registry()
    registry[provider_id] = relative_path
    try:
        with open(_registry_path, "w", encoding="utf-8") as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to save registry: {e}")

def get_downloaded_registry() -> dict[str, str]:
    return _load_registry()
