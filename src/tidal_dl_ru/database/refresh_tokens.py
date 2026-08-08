"""HttpOnly refresh-token sessions (rotation on each refresh)."""

from __future__ import annotations

import hashlib
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlmodel import Field, Session, SQLModel, select

REFRESH_COOKIE_NAME = "flacaud_refresh"
REFRESH_TOKEN_DAYS = int(os.environ.get("TIDALDLRU_REFRESH_TOKEN_DAYS", "30"))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class RefreshSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(max_length=64, unique=True, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    expires_at: datetime
    revoked: bool = Field(default=False)


def refresh_cookie_secure() -> bool:
    return os.environ.get("TIDALDLRU_ENV", "").lower() in ("production", "prod")


def issue_refresh_token(session: Session, user_id: int) -> str:
    raw = secrets.token_urlsafe(48)
    row = RefreshSession(
        user_id=user_id,
        token_hash=_hash_token(raw),
        expires_at=_utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
    )
    session.add(row)
    session.commit()
    return raw


def revoke_refresh_token(session: Session, raw: str) -> None:
    if not raw:
        return
    row = session.exec(
        select(RefreshSession).where(RefreshSession.token_hash == _hash_token(raw))
    ).first()
    if row:
        row.revoked = True
        session.add(row)
        session.commit()


def revoke_all_refresh_sessions_for_user(session: Session, user_id: int) -> int:
    """Revoke every active refresh session for *user_id* (password reset / account delete)."""
    rows = session.exec(
        select(RefreshSession).where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked == False,  # noqa: E712
        )
    ).all()
    for row in rows:
        row.revoked = True
        session.add(row)
    if rows:
        session.commit()
    return len(rows)


def consume_refresh_token(session: Session, raw: str) -> int | None:
    """Validate refresh token, revoke it, return user_id for rotation."""
    if not raw:
        return None
    h = _hash_token(raw)
    row = session.exec(
        select(RefreshSession).where(
            RefreshSession.token_hash == h,
            RefreshSession.revoked == False,  # noqa: E712
        )
    ).first()
    if not row:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= _utcnow():
        row.revoked = True
        session.add(row)
        session.commit()
        return None
    row.revoked = True
    session.add(row)
    session.commit()
    return row.user_id


# Handles the double-refresh race: two tabs (or two near-simultaneous page
# loads, e.g. an old PWA-update reload) sharing one httpOnly cookie can both
# POST /api/auth/refresh with the SAME still-valid raw token. Without this,
# the second caller's consume finds the row already revoked by the first and
# 401s -- logging out a tab whose session was objectively still valid. A
# short in-memory grace window makes a repeat call with the same raw token
# idempotent: it returns the SAME already-issued successor instead of 401ing
# or minting a second (wasted) rotation. Per-process cache is fine here --
# a miss just falls back to the old (rare) 401 behavior, not a new failure.
_ROTATION_GRACE_SECONDS = 10
_recent_rotations: dict[str, tuple[float, int, str]] = {}


def rotate_refresh_token(session: Session, raw: str) -> tuple[int, str] | None:
    """Atomically consume *raw* and issue its successor -> (user_id, new_raw).

    Idempotent for repeat calls with the same *raw* within a short grace
    window after the first rotation.
    """
    if not raw:
        return None
    h = _hash_token(raw)
    now = time.time()
    cached = _recent_rotations.get(h)
    if cached and now - cached[0] < _ROTATION_GRACE_SECONDS:
        return cached[1], cached[2]

    user_id = consume_refresh_token(session, raw)
    if user_id is None:
        return None
    new_raw = issue_refresh_token(session, user_id)
    _recent_rotations[h] = (now, user_id, new_raw)
    if len(_recent_rotations) > 512:
        stale = sorted(_recent_rotations, key=lambda k: _recent_rotations[k][0])[:256]
        for k in stale:
            _recent_rotations.pop(k, None)
    return user_id, new_raw
