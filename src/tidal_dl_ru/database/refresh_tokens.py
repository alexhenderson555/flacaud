"""HttpOnly refresh-token sessions (rotation on each refresh)."""

from __future__ import annotations

import hashlib
import os
import secrets
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
