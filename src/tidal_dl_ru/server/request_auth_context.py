"""Resolve request actor for access logs (no DB, secrets redacted)."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode

from fastapi import Request
from jose import JWTError, jwt

from tidal_dl_ru.database.auth import ALGORITHM, SECRET_KEY, verify_media_token

_SENSITIVE_QUERY_KEYS = frozenset(
    {
        "password",
        "token",
        "mt",
        "access_token",
        "refresh_token",
        "code",
        "verifier",
        "client_secret",
        "secret",
    }
)


def _peek_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _peek_jwt_payload(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def peek_request_actor(request: Request) -> dict[str, str | int]:
    """Best-effort user identity for logging. Never raises."""
    actor: dict[str, str | int] = {"auth": "guest"}

    bearer = _peek_bearer_token(request)
    if bearer:
        payload = _peek_jwt_payload(bearer)
        if payload:
            actor["auth"] = "bearer"
            sub = payload.get("sub")
            if sub:
                actor["username"] = str(sub)
            uid = payload.get("uid")
            if uid is not None:
                actor["user_id"] = int(uid)
            return actor
        actor["auth"] = "bearer_invalid"
        return actor

    mt = request.query_params.get("mt")
    if mt:
        uid = verify_media_token(mt)
        if uid is not None:
            return {"auth": "media", "user_id": int(uid)}

    return actor


def sanitize_query(query: str) -> str:
    if not query:
        return ""
    pairs: list[tuple[str, str]] = []
    for key, value in parse_qsl(query, keep_blank_values=True):
        if key.lower() in _SENSITIVE_QUERY_KEYS:
            pairs.append((key, "***"))
        else:
            pairs.append((key, value))
    return urlencode(pairs)
