"""TTL cache for artist portrait URLs (Deezer / iTunes / Tidal)."""

from __future__ import annotations

import os
import time

_TTL_SEC = float(os.environ.get("TIDALDLRU_ARTIST_IMAGE_CACHE_TTL", "604800"))
_store: dict[str, tuple[float, str | None]] = {}


def artist_image_cache_get(artist_id: str) -> str | None | bool:
    """Return False if missing; str if URL cached; None if cached negative hit."""
    key = str(artist_id)
    row = _store.get(key)
    if not row:
        return False
    expires, url = row
    if time.monotonic() > expires:
        _store.pop(key, None)
        return False
    return url


def artist_image_cache_set(artist_id: str, url: str | None) -> None:
    _store[str(artist_id)] = (time.monotonic() + _TTL_SEC, url)
