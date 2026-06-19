"""Ingest browser-side errors into structured logs + metrics."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from tidal_dl_ru.server.metrics import record_client_error

logger = logging.getLogger("tidal_dl_ru.client")
router = APIRouter()

_STACK_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class ClientErrorReport(BaseModel):
    message: str = Field(max_length=500)
    stack: str | None = Field(default=None, max_length=4000)
    url: str | None = Field(default=None, max_length=500)
    component: str | None = Field(default=None, max_length=64)


def _sanitize(text: str | None, limit: int) -> str:
    if not text:
        return ""
    cleaned = _STACK_RE.sub("", text).strip()
    return cleaned[:limit]


@router.post("/api/client-errors")
async def ingest_client_error(request: Request, body: ClientErrorReport) -> dict:
    component = _sanitize(body.component, 64) or "unknown"
    message = _sanitize(body.message, 500) or "unknown"
    stack = _sanitize(body.stack, 4000)
    url = _sanitize(body.url, 500)
    ua = (request.headers.get("user-agent") or "")[:200]

    record_client_error(component)
    logger.warning(
        "client_error component=%s url=%s message=%s",
        component,
        url or "-",
        message,
        extra={
            "event": "client_error",
            "component": component,
            "url": url,
            "error_message": message,
            "stack": stack,
            "user_agent": ua,
        },
    )
    return {"ok": True}
