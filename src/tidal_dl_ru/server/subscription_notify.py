"""Subscription expiry reminders (email)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import redis
from sqlmodel import Session, select

from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.email_outbound import public_site_base, send_subscription_reminder_email
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.server.subscription_telegram import send_subscription_telegram

log = logging.getLogger(__name__)

_WARN_DAYS = 3
_REDIS_PREFIX = "tidaldl:sub_warn:"


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _warn_key(user_id: int, expires: datetime) -> str:
    day = expires.astimezone(timezone.utc).strftime("%Y-%m-%d")
    return f"{_REDIS_PREFIX}{user_id}:{day}"


def notify_expiring_subscriptions() -> int:
    """Email users whose paid plan expires within {_WARN_DAYS} days. Returns count sent."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=_WARN_DAYS)
    sent = 0
    r = _redis()

    with Session(db_mod.engine) as session:
        users = session.exec(select(User)).all()
        for user in users:
            plan = (user.plan or "free").lower()
            if plan in ("free", "lifetime") or not user.subscription_expires_at:
                continue
            if not user.email and not user.telegram_id:
                continue
            if user.email and not user.email_verified and not user.telegram_id:
                continue
            expires = user.subscription_expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires <= now or expires > horizon:
                continue
            assert user.id is not None
            key = _warn_key(user.id, expires)
            if r.get(key):
                continue
            days_left = max(1, (expires - now).days)
            renew_url = f"{public_site_base()}/account"
            notified = False
            if user.email and user.email_verified:
                ok = send_subscription_reminder_email(
                    to_email=user.email,
                    username=user.username,
                    plan=plan,
                    expires_at=expires,
                    days_left=days_left,
                    renew_url=renew_url,
                )
                if ok:
                    notified = True
            if user.telegram_id:
                tg_text = (
                    f"<b>FlacAud</b> — your <b>{plan}</b> plan expires in <b>{days_left}</b> day(s).\n"
                    f"Renew: {renew_url}"
                )
                if send_subscription_telegram(user.telegram_id, tg_text):
                    notified = True
            if notified:
                r.setex(key, 60 * 60 * 24 * (_WARN_DAYS + 2), "1")
                sent += 1
                log.info(
                    "subscription_reminder_sent user_id=%s days_left=%s",
                    user.id,
                    days_left,
                    extra={"event": "subscription_reminder_sent"},
                )
    return sent
