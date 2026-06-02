"""Security headers and Redis-backed rate limiting."""

from __future__ import annotations

import os
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Per-IP limits (window seconds, max requests)
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/auth/login": (300, 20),
    "/api/auth/register": (3600, 10),
    "/api/search": (60, 60),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
        if os.environ.get("TIDALDLRU_ENV") == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


class _MemoryBucket:
    __slots__ = ("count", "reset_at")

    def __init__(self) -> None:
        self.count = 0
        self.reset_at = 0.0


_memory: dict[str, _MemoryBucket] = {}


def _memory_check(key: str, window: int, limit: int) -> bool:
    now = time.monotonic()
    bucket = _memory.get(key)
    if bucket is None or now >= bucket.reset_at:
        bucket = _MemoryBucket()
        bucket.reset_at = now + window
        _memory[key] = bucket
    bucket.count += 1
    return bucket.count <= limit


async def _redis_check(redis, key: str, window: int, limit: int) -> bool:
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    count, _ = await pipe.execute()
    return int(count) <= limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        rule = RATE_LIMITS.get(path)
        if rule is None or request.method not in ("POST", "GET"):
            return await call_next(request)

        window, limit = rule
        client_ip = request.client.host if request.client else "unknown"
        key = f"rl:{client_ip}:{path}"

        redis = getattr(request.app.state, "arq", None)
        allowed = True
        if redis is not None:
            try:
                allowed = await _redis_check(redis, key, window, limit)
            except Exception:
                allowed = _memory_check(key, window, limit)
        else:
            allowed = _memory_check(key, window, limit)

        if not allowed:
            return Response(
                content='{"detail":"Too many requests. Try again later."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)
