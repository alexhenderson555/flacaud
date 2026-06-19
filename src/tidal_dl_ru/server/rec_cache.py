"""Short TTL cache for expensive recommendation builds."""

from __future__ import annotations

import os
import time
from typing import Any

# 0 = fresh recommendations every request (default). Set e.g. 120 to reduce Tidal API load.
_TTL_SEC = float(os.environ.get("TIDALDLRU_REC_CACHE_TTL", "0"))
_store: dict[tuple[Any, ...], tuple[float, list]] = {}


def cache_get(user_key: str | int | None, limit: int) -> list | None:
    key = (user_key, limit)
    row = _store.get(key)
    if not row:
        return None
    expires, tracks = row
    if time.monotonic() > expires:
        _store.pop(key, None)
        return None
    return tracks


def cache_set(user_key: str | int | None, limit: int, tracks: list) -> None:
    if _TTL_SEC <= 0:
        return
    _store[(user_key, limit)] = (time.monotonic() + _TTL_SEC, tracks)


def cache_invalidate(user_key: str | int | None, limit: int | None = None) -> None:
    if limit is not None:
        _store.pop((user_key, limit), None)
        return
    keys = [k for k in _store if k[0] == user_key]
    for k in keys:
        _store.pop(k, None)


def cache_stats() -> dict:
    now = time.monotonic()
    active = sum(1 for exp, _ in _store.values() if exp > now)
    return {"entries": len(_store), "active": active, "ttl_sec": _TTL_SEC}
