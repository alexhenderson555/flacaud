"""Web user payment webhook (user_id metadata)."""


def _verified_web(plan: str, user_id: str, value: str | None = None):
    from tidal_dl_ru.bot.users import Plan
    from tidal_dl_ru.server import payments as pmod

    if value is None:
        value = pmod.PLAN_PRICE.get(Plan(plan), "0.00")
    return {
        "status": "succeeded",
        "paid": True,
        "amount": {"value": value, "currency": "RUB"},
        "metadata": {"user_id": user_id, "plan": plan},
    }


def test_web_user_pro_plan(monkeypatch):
    from sqlmodel import Session

    from tidal_dl_ru.database import database as db_mod
    from tidal_dl_ru.database.models import User
    from tidal_dl_ru.server import payments as pmod

    with Session(db_mod.engine) as session:
        user = User(username="web1", email="w@test.com", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id

    monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: _verified_web("pro", str(uid)))
    body = {"event": "payment.succeeded", "object": {"id": "pay_web"}}
    assert pmod.process_webhook(body) is True

    with Session(db_mod.engine) as session:
        user = session.get(User, uid)
        assert user.plan == "pro"
