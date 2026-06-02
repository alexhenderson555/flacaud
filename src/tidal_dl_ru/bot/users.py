"""User storage — SQLite-backed via SQLAlchemy.

Tracks Telegram users, their subscription plan, and daily download counts.
Lightweight — no Postgres needed for MVP.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Engine,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from tidal_dl_ru.config import CONFIG_DIR, ensure_dirs


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


# --- ORM ---

class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    plan: Mapped[str] = mapped_column(String(16), default=Plan.FREE.value)
    subscription_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    downloads_today: Mapped[int] = mapped_column(Integer, default=0)
    total_downloads: Mapped[int] = mapped_column(Integer, default=0)
    quota_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    karaoke_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    dj_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    @property
    def effective_plan(self) -> Plan:
        """Return the active plan, downgrading to FREE if subscription expired."""
        p = Plan(self.plan)
        if p == Plan.FREE or p == Plan.LIFETIME:
            return p
        if self.subscription_expires_at:
            expires = self.subscription_expires_at
            # Handle both naive and aware datetimes (SQLite stores naive).
            now = datetime.now(timezone.utc)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > now:
                return p
        return Plan.FREE

    @property
    def daily_limit(self) -> int:
        return PLAN_LIMITS.get(self.effective_plan, PLAN_LIMITS[Plan.FREE])

    @property
    def can_download(self) -> bool:
        return self.downloads_today < self.daily_limit


# --- engine / session ---

_USERS_DB = CONFIG_DIR / "users.db"
_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker[Session]] = None


def _get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        ensure_dirs()
        _engine = create_engine(
            f"sqlite:///{_USERS_DB}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def _session() -> Session:
    _get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


# --- operations ---

def get_or_create(
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> User:
    """Get existing user or create a new free-tier one."""
    with _session() as s:
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
            )
            s.add(user)
            s.commit()
            s.refresh(user)
        else:
            # Update profile info if changed.
            changed = False
            if username and user.username != username:
                user.username = username
                changed = True
            if first_name and user.first_name != first_name:
                user.first_name = first_name
                changed = True
            if changed:
                s.commit()
        return user


def check_and_increment(telegram_id: int) -> tuple[bool, User]:
    """Check if user can download. If yes, increment counter. Returns (allowed, user)."""
    with _session() as s:
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            return False, User(telegram_id=telegram_id, plan=Plan.FREE.value, downloads_today=0)

        # Reset daily counter if needed.
        now = datetime.now(timezone.utc)
        if user.quota_reset_at is None or now.date() > user.quota_reset_at.date():
            user.downloads_today = 0
            user.quota_reset_at = now

        if not user.can_download:
            s.commit()
            return False, user

        user.downloads_today += 1
        user.total_downloads += 1
        s.commit()
        return True, user


def record_downloads(telegram_id: int, count: int) -> None:
    """Record N successful downloads (for batch/album downloads)."""
    if count <= 0:
        return
    with _session() as s:
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            return
        # First download already incremented by check_and_increment,
        # so add count-1 for the remaining tracks.
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
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            return None
        user.plan = plan.value
        user.subscription_expires_at = expires_at
        s.commit()
        return user


def toggle_karaoke(telegram_id: int) -> bool:
    """Toggle karaoke mode. Returns new state."""
    with _session() as s:
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            return False
        user.karaoke_enabled = not user.karaoke_enabled
        s.commit()
        return user.karaoke_enabled


def toggle_dj(telegram_id: int) -> bool:
    """Toggle DJ analysis mode. Returns new state."""
    with _session() as s:
        user = s.query(User).filter(User.telegram_id == telegram_id).first()
        if user is None:
            return False
        user.dj_enabled = not user.dj_enabled
        s.commit()
        return user.dj_enabled


def reset_all_daily_quotas() -> int:
    """Reset downloads_today for all users. Run as daily cron."""
    with _session() as s:
        now = datetime.now(timezone.utc)
        result = s.query(User).update(
            {User.downloads_today: 0, User.quota_reset_at: now}
        )
        s.commit()
        return result
