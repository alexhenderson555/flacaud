"""HTTP request/response logging middleware."""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from tidal_dl_ru.logging_config import request_id_var

logger = logging.getLogger("tidal_dl_ru.access")

_SKIP_PATHS = frozenset({"/healthz", "/favicon.ico", "/manifest.json", "/manifest.webmanifest"})
_SKIP_PREFIXES = ("/assets/",)


def _should_skip(path: str) -> bool:
    if path in _SKIP_PATHS:
        return True
    return any(path.startswith(p) for p in _SKIP_PREFIXES)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            if not _should_skip(path):
                logger.exception(
                    "request_failed method=%s path=%s duration_ms=%s client_ip=%s",
                    request.method,
                    path,
                    duration_ms,
                    _client_ip(request),
                    extra={
                        "method": request.method,
                        "path": path,
                        "duration_ms": duration_ms,
                        "client_ip": _client_ip(request),
                        "event": "request_failed",
                    },
                )
            raise
        finally:
            request_id_var.reset(token)

        duration_ms = int((time.perf_counter() - start) * 1000)
        if _should_skip(path):
            return response

        status = response.status_code
        slow_ms = int(os.environ.get("TIDALDLRU_SLOW_REQUEST_MS", "2000"))
        level = logging.INFO
        if status >= 500:
            level = logging.ERROR
        elif status >= 400:
            level = logging.WARNING
        elif duration_ms >= slow_ms:
            level = logging.WARNING

        logger.log(
            level,
            "request method=%s path=%s status=%s duration_ms=%s client_ip=%s",
            request.method,
            path,
            status,
            duration_ms,
            _client_ip(request),
            extra={
                "method": request.method,
                "path": path,
                "status": status,
                "duration_ms": duration_ms,
                "client_ip": _client_ip(request),
                "event": "request",
            },
        )
        response.headers["X-Request-Id"] = rid
        return response
