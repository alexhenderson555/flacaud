"""Subscription expiry downgrade."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, create_engine, select

from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.subscription_lifecycle import expire_due_subscriptions


def test_expire_due_subscriptions(tmp_path):
    db = tmp_path / "sub.db"
    engine = create_engine(f"sqlite:///{db.as_posix()}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    import tidal_dl_ru.database.database as db_mod

    old_engine = db_mod.engine
    db_mod.engine = engine
    try:
        past = datetime.now(timezone.utc) - timedelta(days=1)
        with Session(engine) as session:
            session.add(
                User(
                    username="expired_user",
                    email="exp@t.local",
                    plan="pro",
                    subscription_expires_at=past,
                )
            )
            session.commit()

        assert expire_due_subscriptions() == 1

        with Session(engine) as session:
            user = session.exec(select(User).where(User.username == "expired_user")).first()
            assert user.plan == "free"
            assert user.subscription_expires_at is None
    finally:
        db_mod.engine = old_engine
