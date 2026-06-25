"""Security headers and Redis-backed rate limiting."""

from __future__ import annotations

import logging
import os
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Exact path → (window seconds, max requests)
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/auth/login": (300, 20),
    "/api/auth/register": (3600, 10),
    "/api/auth/forgot-password": (3600, 5),
    "/api/auth/reset-password": (3600, 10),
    "/api/auth/tidal-login": (3600, 20),
    "/api/auth/callback": (3600, 20),
    "/api/auth/status": (60, 60),
    "/api/search": (60, 60),
    "/api/lyrics": (60, 45),
    "/api/ai-playlist": (60, 15),
    "/api/recommendations": (60, 40),
    "/api/recognize": (60, 20),
    "/api/jobs": (60, 12),
    "/api/tracks/meta": (60, 40),
    "/api/image-proxy": (60, 300),
    "/api/auth/refresh": (3600, 60),
    "/api/payments/create": (3600, 20),
    "/api/webhooks/yookassa": (3600, 120),
    "/api/client-errors": (3600, 60),
    "/api/auth/account": (3600, 5),
    "/api/auth/export": (3600, 10),
    "/api/transfer/preview": (3600, 15),
}


def _rate_limit_rule(path: str, method: str) -> tuple[int, int] | None:
    if path in RATE_LIMITS and method in ("GET", "POST", "DELETE", "PATCH"):
        return RATE_LIMITS[path]
    if method == "POST" and path.endswith("/warm") and "/api/stream/" in path:
        return (60, 40)
    if method == "GET" and path.endswith("/dj-meta"):
        return (60, 30)
    # Quality probes require auth; keep a modest per-IP cap as defense in depth.
    if method == "GET" and "/api/quality/" in path and path.endswith("/available"):
        return (60, 60)
    if method == "GET" and "/api/stream/" in path:
        return (60, 120)
    return None


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
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
                "media-src 'self' blob:; connect-src 'self' https:; font-src 'self' data:; "
                "frame-ancestors 'none'",
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
        rule = _rate_limit_rule(path, request.method)
        if rule is None:
            return await call_next(request)

        window, limit = rule
        client_ip = request.client.host if request.client else "unknown"
        key = f"rl:{client_ip}:{path}"

        redis = getattr(request.app.state, "arq", None)
        allowed = True
        if redis is not None:
            try:
                allowed = await _redis_check(redis, key, window, limit)
            except Exception as exc:
                logger.warning("rate_limit redis error, using memory fallback: %s", exc)
                allowed = _memory_check(key, window, limit)
        else:
            allowed = _memory_check(key, window, limit)

        if not allowed:
            logger.warning(
                "rate_limit path=%s client_ip=%s",
                path,
                client_ip,
                extra={"event": "rate_limit", "path": path, "client_ip": client_ip},
            )
            return Response(
                content='{"detail":{"code":"http_429","message":"Too many requests. Try again later."}}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)
