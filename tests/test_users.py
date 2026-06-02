"""Tests for bot.users — user storage, plans, toggles."""

import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    import tidal_dl_ru.database.database as db_mod
    from sqlmodel import SQLModel

    test_db = tmp_path / "test_users.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    from sqlmodel import create_engine
    db_mod.engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    
    # Create tables
    import tidal_dl_ru.database.models
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(db_mod.engine)
    print("TABLES:", SQLModel.metadata.tables.keys())
    yield
    
    # Cleanup
    db_mod.engine = None
    db_mod.SessionLocal = None


class TestGetOrCreate:
    def test_create_new_user(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create

        user = get_or_create(12345, username="alice", first_name="Alice")
        assert user.telegram_id == 12345
        assert user.username == "alice"
        assert user.plan == Plan.FREE.value

    def test_get_existing_user(self):
        from tidal_dl_ru.bot.users import get_or_create

        u1 = get_or_create(12345, username="alice")
        u2 = get_or_create(12345, username="alice_updated")
        assert u2.username == "alice_updated"
        assert u1.telegram_id == u2.telegram_id

    def test_defaults(self):
        from tidal_dl_ru.bot.users import get_or_create

        user = get_or_create(99999)
        assert user.downloads_today == 0
        assert user.total_downloads == 0
        assert user.karaoke_enabled is False
        assert user.dj_enabled is False


class TestCheckAndIncrement:
    def test_allows_download(self):
        from tidal_dl_ru.bot.users import check_and_increment, get_or_create

        get_or_create(100)
        allowed, user = check_and_increment(100)
        assert allowed is True
        assert user.downloads_today == 1

    def test_respects_limit(self):
        from tidal_dl_ru.bot.users import PLAN_LIMITS, Plan, check_and_increment, get_or_create

        get_or_create(100)
        limit = PLAN_LIMITS[Plan.FREE]
        for _ in range(limit):
            allowed, _ = check_and_increment(100)
            assert allowed is True

        allowed, user = check_and_increment(100)
        assert allowed is False
        assert user.downloads_today == limit

    def test_unknown_user_returns_false(self):
        from tidal_dl_ru.bot.users import check_and_increment

        allowed, user = check_and_increment(999999)
        assert allowed is False


class TestEffectivePlan:
    def test_free_plan(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create

        user = get_or_create(100)
        assert user.effective_plan == Plan.FREE

    def test_active_subscription(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create, set_plan

        get_or_create(100)
        future = datetime.now(timezone.utc) + timedelta(days=30)
        set_plan(100, Plan.PRO, expires_at=future)
        from tidal_dl_ru.bot.users import get_or_create as goc
        user = goc(100)
        assert user.effective_plan == Plan.PRO

    def test_expired_subscription_downgrades(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create, set_plan

        get_or_create(100)
        past = datetime.now(timezone.utc) - timedelta(days=1)
        set_plan(100, Plan.PRO, expires_at=past)
        from tidal_dl_ru.bot.users import get_or_create as goc
        user = goc(100)
        assert user.effective_plan == Plan.FREE

    def test_lifetime_never_expires(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create, set_plan

        get_or_create(100)
        set_plan(100, Plan.LIFETIME)
        from tidal_dl_ru.bot.users import get_or_create as goc
        user = goc(100)
        assert user.effective_plan == Plan.LIFETIME


class TestToggles:
    def test_toggle_karaoke(self):
        from tidal_dl_ru.bot.users import get_or_create, toggle_karaoke

        get_or_create(100)
        assert toggle_karaoke(100) is True
        assert toggle_karaoke(100) is False
        assert toggle_karaoke(100) is True

    def test_toggle_dj(self):
        from tidal_dl_ru.bot.users import get_or_create, toggle_dj

        get_or_create(100)
        assert toggle_dj(100) is True
        assert toggle_dj(100) is False

    def test_toggle_nonexistent_user(self):
        from tidal_dl_ru.bot.users import toggle_karaoke

        assert toggle_karaoke(999999) is False


class TestRecordDownloads:
    def test_records_extra(self):
        from tidal_dl_ru.bot.users import check_and_increment, get_or_create, record_downloads

        get_or_create(100)
        check_and_increment(100)  # +1
        record_downloads(100, 5)  # +4 (first already counted)
        user = get_or_create(100)
        assert user.downloads_today == 5
        assert user.total_downloads == 5

    def test_zero_count_noop(self):
        from tidal_dl_ru.bot.users import get_or_create, record_downloads

        get_or_create(100)
        record_downloads(100, 0)
        user = get_or_create(100)
        assert user.downloads_today == 0


class TestResetQuotas:
    def test_resets_all(self):
        from tidal_dl_ru.bot.users import (
            check_and_increment,
            get_or_create,
            reset_all_daily_quotas,
        )

        get_or_create(100)
        get_or_create(200)
        check_and_increment(100)
        check_and_increment(200)

        count = reset_all_daily_quotas()
        assert count == 2

        u1 = get_or_create(100)
        u2 = get_or_create(200)
        assert u1.downloads_today == 0
        assert u2.downloads_today == 0


class TestReserveWebDownload:
    def test_enforces_then_resets_next_day(self):
        """The web path must reset the daily counter on a new day — otherwise
        users get permanently locked out after hitting the limit once."""
        from datetime import datetime, timedelta, timezone

        from sqlmodel import Session
        from tidal_dl_ru.bot.users import get_or_create, reserve_web_download
        from tidal_dl_ru.database import database
        from tidal_dl_ru.database.models import User

        u = get_or_create(100)
        for _ in range(3):  # free-tier daily limit
            allowed, _ = reserve_web_download(u.id)
            assert allowed is True
        allowed, _ = reserve_web_download(u.id)
        assert allowed is False  # locked out within the same day

        # Roll the reset timestamp back one day → next call must reset & allow.
        with Session(database.engine) as s:
            db_u = s.get(User, u.id)
            db_u.quota_reset_at = datetime.now(timezone.utc) - timedelta(days=1)
            s.commit()

        allowed, user = reserve_web_download(u.id)
        assert allowed is True
        assert user.downloads_today == 1

    def test_unknown_user(self):
        from tidal_dl_ru.bot.users import reserve_web_download

        allowed, user = reserve_web_download(999999)
        assert allowed is False
        assert user is None
