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
        # SET NX EX is atomic -- a separate GET-then-SETEX left a window where
        # two concurrent requests with the same token (a double-clicked reset
        # link, or two uvicorn workers handling a duplicated request) could
        # both see "not consumed yet" and both succeed, defeating the
        # one-time guarantee entirely (e.g. a password-reset token usable
        # more than once within its TTL).
        return bool(r.set(key, "1", nx=True, ex=ttl_seconds))
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
