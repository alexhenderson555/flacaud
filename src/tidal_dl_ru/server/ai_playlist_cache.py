"""Short TTL cache for AI playlist generation (reduces Gemini + Tidal search load)."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any

_TTL_SEC = float(os.environ.get("TIDALDLRU_AI_PLAYLIST_CACHE_TTL", "600"))
_store: dict[str, tuple[float, list]] = {}


def _key(query: str, limit: int, has_image: bool) -> str:
    raw = f"{query.strip().lower()}|{limit}|{int(has_image)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def cache_get(query: str, limit: int, *, has_image: bool = False) -> list | None:
    row = _store.get(_key(query, limit, has_image))
    if not row:
        return None
    expires, tracks = row
    if time.monotonic() > expires:
        _store.pop(_key(query, limit, has_image), None)
        return None
    return tracks


def cache_set(query: str, limit: int, tracks: list, *, has_image: bool = False) -> None:
    _store[_key(query, limit, has_image)] = (time.monotonic() + _TTL_SEC, tracks)


def cache_stats() -> dict[str, Any]:
    now = time.monotonic()
    active = sum(1 for exp, _ in _store.values() if exp > now)
    return {"entries": len(_store), "active": active, "ttl_sec": _TTL_SEC}
