"""User storage — unified with the Web SQLModel database.

Tracks Telegram users, their subscription plan, and daily download counts.
Shares the exact same SQLite database and `User` model as the Web UI API.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Session, select

from tidal_dl_ru.database.models import User


class Plan(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    LIFETIME = "lifetime"


# Limits per plan (tracks/day).
PLAN_LIMITS = {
    Plan.FREE: 3,
    Plan.BASIC: 50,
    Plan.PRO: 200,
    Plan.LIFETIME: 200,
}

PLAN_PRICES = {
    Plan.BASIC: "199₽/мес",
    Plan.PRO: "399₽/мес",
    Plan.LIFETIME: "4990₽ навсегда",
}


def _session() -> Session:
    """Open a session on the shared web DB engine.

    Resolved lazily (not imported at module load) so tests can monkeypatch
    ``database.engine`` with a temporary database.
    """
    from tidal_dl_ru.database import database

    return Session(database.engine, expire_on_commit=False)


def _maybe_reset_daily(user: User, now: datetime) -> None:
    """Zero the daily counter when the calendar day has rolled over.

    Used by BOTH the bot and the web paths so the quota resets consistently
    without relying on an external cron (the web path previously had no reset
    at all, which permanently locked users out after their first day).
    """
    reset_at = user.quota_reset_at
    if reset_at is not None and reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)
    if reset_at is None or now.date() > reset_at.date():
        user.downloads_today = 0
        user.quota_reset_at = now


def get_or_create(
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> User:
    """Get existing user or create a new free-tier one."""
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            # Adopt an existing web account (matched by username) that has no
            # Telegram link yet, to avoid duplicate rows / unique clashes.
            if username:
                existing = s.exec(select(User).where(User.username == username)).first()
                if existing and not existing.telegram_id:
                    existing.telegram_id = telegram_id
                    existing.first_name = first_name
                    s.commit()
                    s.refresh(existing)
                    return existing

            # Username must be unique — fall back to a synthetic one on clash.
            safe_username = username
            if username and s.exec(select(User).where(User.username == username)).first():
                safe_username = f"tg_{telegram_id}"

            user = User(
                telegram_id=telegram_id,
                username=safe_username,
                first_name=first_name,
                plan=Plan.FREE.value,
            )
            s.add(user)
            s.commit()
            s.refresh(user)
        else:
            changed = False
            if username and user.username != username:
                if not s.exec(select(User).where(User.username == username)).first():
                    user.username = username
                    changed = True
            if first_name and user.first_name != first_name:
                user.first_name = first_name
                changed = True
            if changed:
                s.commit()
                s.refresh(user)
        return user


def check_and_increment(telegram_id: int) -> tuple[bool, User]:
    """Bot path: reset-if-new-day, check the limit, reserve one download.

    Returns (allowed, user)."""
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            return False, User(telegram_id=telegram_id, plan=Plan.FREE.value, downloads_today=0)

        now = datetime.now(timezone.utc)
        _maybe_reset_daily(user, now)

        if not user.can_download:
            s.commit()
            return False, user

        user.downloads_today += 1
        user.total_downloads += 1
        s.commit()
        s.refresh(user)
        return True, user


def reserve_web_download(user_id: int) -> tuple[bool, Optional[User]]:
    """Web-API counterpart of ``check_and_increment``, keyed by web user id.

    Resets the daily counter on a new day, enforces the plan limit, and
    reserves one download. Returns (allowed, user)."""
    with _session() as s:
        user = s.get(User, user_id)
        if user is None:
            return False, None

        now = datetime.now(timezone.utc)
        _maybe_reset_daily(user, now)

        if not user.can_download:
            s.commit()
            return False, user

        user.downloads_today += 1
        user.total_downloads += 1
        s.commit()
        s.refresh(user)
        return True, user


def record_downloads(telegram_id: int, count: int) -> None:
    """Record N successful downloads (for batch/album downloads)."""
    if count <= 0:
        return
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            return
        # First download already counted by check_and_increment, so add count-1.
        user.downloads_today += count - 1
        user.total_downloads += count - 1
        s.commit()


def set_plan(
    telegram_id: int,
    plan: Plan,
    expires_at: Optional[datetime] = None,
) -> Optional[User]:
    """Update user's subscription plan."""
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            return None
        user.plan = plan.value
        user.subscription_expires_at = expires_at
        s.commit()
        s.refresh(user)
        return user


def toggle_karaoke(telegram_id: int) -> bool:
    """Toggle karaoke mode. Returns new state."""
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            return False
        user.karaoke_enabled = not user.karaoke_enabled
        s.commit()
        return user.karaoke_enabled


def toggle_dj(telegram_id: int) -> bool:
    """Toggle DJ analysis mode. Returns new state."""
    with _session() as s:
        user = s.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if user is None:
            return False
        user.dj_enabled = not user.dj_enabled
        s.commit()
        return user.dj_enabled


def reset_all_daily_quotas() -> int:
    """Reset downloads_today for all users. Returns the number of users reset.

    Kept for use as a daily cron; the per-request reset in
    ``check_and_increment`` / ``reserve_web_download`` means the app no longer
    depends on it being scheduled.
    """
    with _session() as s:
        now = datetime.now(timezone.utc)
        users = s.exec(select(User)).all()
        for u in users:
            u.downloads_today = 0
            u.quota_reset_at = now
        s.commit()
        return len(users)
