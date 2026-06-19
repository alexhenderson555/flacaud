"""Tests for stacked subscription expiry on renew."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, create_engine

from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.subscription_apply import apply_paid_plan_for_user_id
from tidal_dl_ru.server.subscription_dates import _aware, stack_subscription_expiry


def test_stack_extends_from_current_expiry():
    now = datetime(2026, 6, 1, tzinfo=timezone.utc)
    current = now + timedelta(days=10)
    new_exp = stack_subscription_expiry(current, Plan.BASIC, now=now)
    assert new_exp == current + timedelta(days=30)


def test_apply_paid_plan_stacks(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod

    db_file = tmp_path / "renew.db"
    engine = create_engine(f"sqlite:///{db_file.as_posix()}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db_mod, "engine", engine)
    future = datetime.now(timezone.utc) + timedelta(days=20)
    with Session(engine) as session:
        u = User(username="u1", email="u1@t.local", plan="basic", subscription_expires_at=future)
        session.add(u)
        session.commit()
        session.refresh(u)
        uid = u.id
    user = apply_paid_plan_for_user_id(uid, Plan.BASIC)
    assert user is not None
    assert _aware(user.subscription_expires_at) > future
