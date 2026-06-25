"""One-time token consumption (password-reset replay protection)."""

from __future__ import annotations

import hashlib
import logging
import time

logger = logging.getLogger(__name__)

_mem: dict[str, float] = {}


def consume_token(namespace: str, raw_token: str, ttl_seconds: int) -> bool:
    """Mark *raw_token* as used under *namespace*. Returns False if already consumed."""
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    key = f"ot:{namespace}:{digest}"
    try:
        from tidal_dl_ru.server.jobs import _client as redis_client

        r = redis_client()
        if r.get(key):
            return False
        r.setex(key, ttl_seconds, "1")
        return True
    except Exception as exc:
        logger.debug("one_time_token redis fallback: %s", exc)

    now = time.time()
    expired = [k for k, exp in _mem.items() if exp <= now]
    for k in expired:
        _mem.pop(k, None)
    if key in _mem:
        return False
    _mem[key] = now + ttl_seconds
    return True
