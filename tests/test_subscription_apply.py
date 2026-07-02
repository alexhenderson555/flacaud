"""Tests for subscription apply and cancel-at-period-end."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, create_engine, select

from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.database.models import User


def _make_engine(tmp_path):
    db = tmp_path / "sub_apply.db"
    engine = create_engine(f"sqlite:///{db.as_posix()}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


def test_apply_paid_plan_for_user_id(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_apply as mod

    monkeypatch.setattr(mod.db_mod, "engine", engine)

    with Session(engine) as session:
        user = User(username="testuser", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id

    result = mod.apply_paid_plan_for_user_id(uid, Plan.PRO)
    assert result is not None
    assert result.plan == "pro"
    assert result.subscription_expires_at is not None
    assert result.subscription_cancel_at_period_end is False


def test_apply_paid_plan_nonexistent_user(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_apply as mod

    monkeypatch.setattr(mod.db_mod, "engine", engine)
    assert mod.apply_paid_plan_for_user_id(99999, Plan.PRO) is None


def test_apply_lifetime_plan_sets_no_expiry(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_apply as mod

    monkeypatch.setattr(mod.db_mod, "engine", engine)

    with Session(engine) as session:
        user = User(username="lifer", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id

    result = mod.apply_paid_plan_for_user_id(uid, Plan.LIFETIME)
    assert result is not None
    assert result.plan == "lifetime"
    assert result.subscription_expires_at is None


def test_cancel_at_period_end(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_apply as mod

    monkeypatch.setattr(mod.db_mod, "engine", engine)

    with Session(engine) as session:
        user = User(username="cancelme", plan="pro", subscription_expires_at=datetime.now(timezone.utc) + timedelta(days=10))
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id

    with Session(engine) as session:
        user = session.get(User, uid)

    result = mod.cancel_at_period_end(user)
    assert result.subscription_cancel_at_period_end is True


def test_cancel_nonexistent_user_returns_input(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_apply as mod

    monkeypatch.setattr(mod.db_mod, "engine", engine)

    fake_user = User(id=99999, username="ghost", plan="free")
    result = mod.cancel_at_period_end(fake_user)
    # Returns the input user since DB row doesn't exist
    assert result is fake_user
