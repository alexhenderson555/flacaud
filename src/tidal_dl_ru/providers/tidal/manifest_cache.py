"""In-memory playback manifest cache (shared by probe + stream)."""

from __future__ import annotations

import threading
import time

from tidal_dl_ru.providers.tidal.models import PlaybackManifest

_lock = threading.Lock()
_manifests: dict[str, tuple[float, PlaybackManifest]] = {}
_track_rate_limit_until: dict[str, float] = {}

MANIFEST_TTL_SEC = 600
RATE_LIMIT_TRACK_TTL_SEC = 30


def _key(track_id: str, quality_name: str) -> str:
    return f"{track_id}:{quality_name}"


def get(track_id: str, quality_name: str) -> PlaybackManifest | None:
    k = _key(track_id, quality_name)
    with _lock:
        entry = _manifests.get(k)
        if not entry:
            return None
        ts, manifest = entry
        if time.time() - ts > MANIFEST_TTL_SEC:
            _manifests.pop(k, None)
            return None
        return manifest


def put(track_id: str, quality_name: str, manifest: PlaybackManifest) -> None:
    with _lock:
        _manifests[_key(track_id, quality_name)] = (time.time(), manifest)


def mark_track_rate_limited(track_id: str, ttl_sec: float = RATE_LIMIT_TRACK_TTL_SEC) -> None:
    with _lock:
        _track_rate_limit_until[str(track_id)] = time.time() + ttl_sec


def is_track_rate_limited(track_id: str) -> bool:
    with _lock:
        until = _track_rate_limit_until.get(str(track_id), 0)
    return until > time.time()


def clear_for_tests() -> None:
    with _lock:
        _manifests.clear()
        _track_rate_limit_until.clear()
