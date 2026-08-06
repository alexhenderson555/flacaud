"""HTTP request/response logging middleware."""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from tidal_dl_ru.logging_config import request_id_var, user_id_var, username_var
from tidal_dl_ru.server.metrics import record_http_request
from tidal_dl_ru.server.request_auth_context import peek_request_actor, sanitize_query

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


def _request_extra(request: Request, **fields) -> dict:
    actor = peek_request_actor(request)
    query = sanitize_query(request.url.query)
    user_agent = (request.headers.get("user-agent") or "")[:200]
    extra = {
        "method": request.method,
        "path": request.url.path,
        "query": query or None,
        "client_ip": _client_ip(request),
        "user_agent": user_agent or None,
        "auth": actor.get("auth", "guest"),
        **fields,
    }
    if "user_id" in actor:
        extra["user_id"] = actor["user_id"]
    if "username" in actor:
        extra["username"] = actor["username"]
        extra["user"] = actor["username"]
    return extra


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        rid_token = request_id_var.set(rid)

        actor = peek_request_actor(request)
        uid_token = user_id_var.set(str(actor.get("user_id", "-")))
        uname_token = username_var.set(str(actor.get("username", "-")))

        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            if not _should_skip(path):
                logger.exception(
                    "request_failed method=%s path=%s duration_ms=%s client_ip=%s auth=%s",
                    request.method,
                    path,
                    duration_ms,
                    _client_ip(request),
                    actor.get("auth", "guest"),
                    extra=_request_extra(
                        request,
                        duration_ms=duration_ms,
                        event="request_failed",
                    ),
                )
            raise
        finally:
            request_id_var.reset(rid_token)
            user_id_var.reset(uid_token)
            username_var.reset(uname_token)

        duration_ms = int((time.perf_counter() - start) * 1000)
        if _should_skip(path):
            return response

        status = response.status_code
        record_http_request(request.method, path, status, duration_ms / 1000.0)
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
            "request method=%s path=%s status=%s duration_ms=%s client_ip=%s auth=%s",
            request.method,
            path,
            status,
            duration_ms,
            _client_ip(request),
            actor.get("auth", "guest"),
            extra=_request_extra(
                request,
                status=status,
                duration_ms=duration_ms,
                event="request",
            ),
        )
        response.headers["X-Request-Id"] = rid
        return response
