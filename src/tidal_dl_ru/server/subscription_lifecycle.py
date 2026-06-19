"""Downgrade expired subscriptions (web + bot users)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import User

log = logging.getLogger(__name__)


def expire_due_subscriptions() -> int:
    """Set plan to free for users past subscription_expires_at. Returns count updated."""
    now = datetime.now(timezone.utc)
    updated = 0
    with Session(db_mod.engine) as session:
        users = session.exec(select(User)).all()
        for user in users:
            plan = (user.plan or "free").lower()
            if plan in ("free", "lifetime") or not user.subscription_expires_at:
                continue
            expires = user.subscription_expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > now:
                continue
            user.plan = "free"
            user.subscription_expires_at = None
            updated += 1
            log.info(
                "subscription_expired user_id=%s former_plan=%s",
                user.id,
                plan,
                extra={"event": "subscription_expired"},
            )
        if updated:
            session.commit()
    return updated
