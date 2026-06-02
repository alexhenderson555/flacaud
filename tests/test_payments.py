"""Tests for server.payments — webhook processing."""

import pytest


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    import tidal_dl_ru.bot.users as users_mod

    monkeypatch.setattr(users_mod, "_USERS_DB", tmp_path / "test_users.db")
    users_mod._engine = None
    users_mod._SessionLocal = None
    yield
    users_mod._engine = None
    users_mod._SessionLocal = None


class TestProcessWebhook:
    def test_successful_payment(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create
        from tidal_dl_ru.server.payments import process_webhook

        get_or_create(12345)

        body = {
            "event": "payment.succeeded",
            "object": {
                "status": "succeeded",
                "metadata": {
                    "telegram_id": "12345",
                    "plan": "pro",
                },
            },
        }
        result = process_webhook(body)
        assert result is True

        user = get_or_create(12345)
        assert user.plan == Plan.PRO.value
        assert user.subscription_expires_at is not None

    def test_wrong_event_ignored(self):
        from tidal_dl_ru.server.payments import process_webhook

        body = {"event": "payment.canceled", "object": {}}
        assert process_webhook(body) is False

    def test_missing_metadata(self):
        from tidal_dl_ru.server.payments import process_webhook

        body = {
            "event": "payment.succeeded",
            "object": {"status": "succeeded", "metadata": {}},
        }
        assert process_webhook(body) is False

    def test_invalid_plan(self):
        from tidal_dl_ru.server.payments import process_webhook

        body = {
            "event": "payment.succeeded",
            "object": {
                "status": "succeeded",
                "metadata": {"telegram_id": "12345", "plan": "invalid"},
            },
        }
        assert process_webhook(body) is False

    def test_lifetime_plan(self):
        from tidal_dl_ru.bot.users import Plan, get_or_create
        from tidal_dl_ru.server.payments import PLAN_DURATION_DAYS, process_webhook

        get_or_create(12345)

        body = {
            "event": "payment.succeeded",
            "object": {
                "status": "succeeded",
                "metadata": {"telegram_id": "12345", "plan": "lifetime"},
            },
        }
        result = process_webhook(body)
        assert result is True

        user = get_or_create(12345)
        assert user.plan == Plan.LIFETIME.value
