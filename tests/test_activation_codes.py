"""Activation code generation and redemption."""

from sqlmodel import Session, select

from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.activation_codes import ActivationCode, generate_code, redeem_code


def test_generate_and_redeem_lifetime():
    with Session(db_mod.engine) as session:
        user = User(username="code_user1", email="code1@test.com", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)

        code = generate_code(plan="lifetime", note="test")
        ok, msg = redeem_code(code, user.id, telegram_id=None)
        assert ok is True
        assert "lifetime" in msg

        session.refresh(user)
        assert user.plan == "lifetime"

        row = session.exec(select(ActivationCode).where(ActivationCode.code == code)).first()
        assert row.redeemed_at is not None


def test_redeem_twice_fails():
    with Session(db_mod.engine) as session:
        user = User(username="code_user2", email="code2@test.com", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)

        code = generate_code(plan="pro")
        assert redeem_code(code, user.id)[0] is True
        ok, msg = redeem_code(code, user.id)
        assert ok is False
        assert "already" in msg.lower()
