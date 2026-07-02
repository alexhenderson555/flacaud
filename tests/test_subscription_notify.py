"""Tests for subscription expiry notification logic."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from sqlmodel import Session, SQLModel, create_engine, select

from tidal_dl_ru.database.models import User


def _make_engine(tmp_path):
    db = tmp_path / "sub_notify.db"
    engine = create_engine(f"sqlite:///{db.as_posix()}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


def _make_user(username, **kwargs) -> User:
    defaults = {"username": username, "plan": "pro", "email": f"{username}@t.local", "email_verified": True}
    defaults.update(kwargs)
    return User(**defaults)


def test_notify_skips_free_and_lifetime(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    monkeypatch.setattr(mod, "_redis", lambda: MagicMock(get=lambda key: None, setex=lambda *a: None))
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    with Session(engine) as session:
        session.add(_make_user("free_user", plan="free"))
        session.add(_make_user("lifetime_user", plan="lifetime"))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0


def test_notify_skips_no_expiry(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    monkeypatch.setattr(mod, "_redis", lambda: MagicMock(get=lambda key: None, setex=lambda *a: None))
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    with Session(engine) as session:
        session.add(_make_user("no_exp", subscription_expires_at=None))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0


def test_notify_skips_already_expired(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    monkeypatch.setattr(mod, "_redis", lambda: MagicMock(get=lambda key: None, setex=lambda *a: None))
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    past = datetime.now(timezone.utc) - timedelta(days=1)
    with Session(engine) as session:
        session.add(_make_user("expired", subscription_expires_at=past))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0


def test_notify_skips_too_far(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    monkeypatch.setattr(mod, "_redis", lambda: MagicMock(get=lambda key: None, setex=lambda *a: None))
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    future = datetime.now(timezone.utc) + timedelta(days=30)
    with Session(engine) as session:
        session.add(_make_user("far_future", subscription_expires_at=future))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0


def test_notify_sends_for_expiring_soon(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    redis_mock = MagicMock()
    redis_mock.get = MagicMock(return_value=None)
    redis_mock.setex = MagicMock()
    monkeypatch.setattr(mod, "_redis", lambda: redis_mock)
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod, "send_subscription_telegram", lambda uid, text: False)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    soon = datetime.now(timezone.utc) + timedelta(days=2)
    with Session(engine) as session:
        session.add(_make_user("expiring", subscription_expires_at=soon))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 1
    assert redis_mock.setex.called


def test_notify_skips_already_notified(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    redis_mock = MagicMock()
    redis_mock.get = MagicMock(return_value="1")
    redis_mock.setex = MagicMock()
    monkeypatch.setattr(mod, "_redis", lambda: redis_mock)
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    soon = datetime.now(timezone.utc) + timedelta(days=2)
    with Session(engine) as session:
        session.add(_make_user("already_notified", subscription_expires_at=soon))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0
    redis_mock.setex.assert_not_called()


def test_notify_skips_unverified_email_without_telegram(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.subscription_notify as mod

    redis_mock = MagicMock()
    redis_mock.get = MagicMock(return_value=None)
    redis_mock.setex = MagicMock()
    monkeypatch.setattr(mod, "_redis", lambda: redis_mock)
    monkeypatch.setattr(mod, "send_subscription_reminder_email", lambda **kw: True)
    monkeypatch.setattr(mod.db_mod, "engine", engine)

    soon = datetime.now(timezone.utc) + timedelta(days=2)
    with Session(engine) as session:
        session.add(_make_user("unverified", subscription_expires_at=soon, email_verified=False, telegram_id=None))
        session.commit()

    assert mod.notify_expiring_subscriptions() == 0
