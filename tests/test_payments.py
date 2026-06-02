"""Tests for server.payments — webhook processing.

Webhooks are now verified server-side: `process_webhook` re-fetches the payment
from YooKassa via `_fetch_payment`. Tests monkeypatch that call so they stay
offline while still exercising the real verification logic.
"""

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
    import tidal_dl_ru.database.models
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(db_mod.engine)
    yield
    db_mod.engine = None
    db_mod.SessionLocal = None


def _verified(plan: str, telegram_id: str = "12345", value: str | None = None):
    """Build a fake authoritative YooKassa payment response."""
    from tidal_dl_ru.server import payments as pmod
    from tidal_dl_ru.bot.users import Plan

    if value is None:
        value = pmod.PLAN_PRICE.get(Plan(plan), "0.00")
    return {
        "status": "succeeded",
        "paid": True,
        "amount": {"value": value, "currency": "RUB"},
        "metadata": {"telegram_id": telegram_id, "plan": plan},
    }


class TestProcessWebhook:
    def test_successful_payment(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan, get_or_create
        from tidal_dl_ru.server import payments as pmod

        get_or_create(12345)
        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: _verified("pro"))

        body = {"event": "payment.succeeded", "object": {"id": "pay_1", "status": "succeeded"}}
        assert pmod.process_webhook(body) is True

        user = get_or_create(12345)
        assert user.plan == Plan.PRO.value
        assert user.subscription_expires_at is not None

    def test_lifetime_plan(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan, get_or_create
        from tidal_dl_ru.server import payments as pmod

        get_or_create(12345)
        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: _verified("lifetime"))

        body = {"event": "payment.succeeded", "object": {"id": "pay_2", "status": "succeeded"}}
        assert pmod.process_webhook(body) is True
        assert get_or_create(12345).plan == Plan.LIFETIME.value

    def test_wrong_event_ignored(self):
        from tidal_dl_ru.server.payments import process_webhook

        assert process_webhook({"event": "payment.canceled", "object": {}}) is False

    def test_missing_payment_id(self):
        from tidal_dl_ru.server.payments import process_webhook

        body = {"event": "payment.succeeded", "object": {"status": "succeeded"}}
        assert process_webhook(body) is False

    def test_unverifiable_payment_rejected(self, monkeypatch):
        """If YooKassa can't confirm the payment, never grant the plan —
        this is what blocks spoofed webhook bodies."""
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: None)
        body = {"event": "payment.succeeded", "object": {"id": "forged", "status": "succeeded"}}
        assert pmod.process_webhook(body) is False

    def test_amount_mismatch_rejected(self, monkeypatch):
        """A verified payment whose amount doesn't match the plan price is rejected."""
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: _verified("pro", value="1.00"))
        body = {"event": "payment.succeeded", "object": {"id": "pay_3", "status": "succeeded"}}
        assert pmod.process_webhook(body) is False

    def test_missing_metadata(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        verified = {"status": "succeeded", "paid": True, "amount": {"value": "399.00"}, "metadata": {}}
        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: verified)
        body = {"event": "payment.succeeded", "object": {"id": "pay_4", "status": "succeeded"}}
        assert pmod.process_webhook(body) is False

    def test_invalid_plan(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        verified = {
            "status": "succeeded", "paid": True, "amount": {"value": "399.00"},
            "metadata": {"telegram_id": "12345", "plan": "invalid"},
        }
        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: verified)
        body = {"event": "payment.succeeded", "object": {"id": "pay_5", "status": "succeeded"}}
        assert pmod.process_webhook(body) is False
