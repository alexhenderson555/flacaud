"""Short TTL cache for Gemini artist bios."""

from __future__ import annotations

import os
import time

_TTL_SEC = float(os.environ.get("TIDALDLRU_ARTIST_BIO_CACHE_TTL", "86400"))
_store: dict[str, tuple[float, str]] = {}


def bio_cache_get(artist_id: str, lang: str) -> str | None:
    key = f"{artist_id}:{lang}"
    row = _store.get(key)
    if not row:
        return None
    expires, text = row
    if time.monotonic() > expires:
        _store.pop(key, None)
        return None
    return text


def bio_cache_set(artist_id: str, lang: str, text: str) -> None:
    key = f"{artist_id}:{lang}"
    _store[key] = (time.monotonic() + _TTL_SEC, text)
