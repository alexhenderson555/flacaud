"""Tests for payments.create_payment and canceled webhook path."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    from sqlmodel import SQLModel, create_engine

    import tidal_dl_ru.database.database as db_mod
    test_db = tmp_path / "test_pay.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    db_mod.engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    import tidal_dl_ru.database.models  # noqa: F401
    SQLModel.metadata.create_all(db_mod.engine)
    yield
    db_mod.engine = None


class TestCreatePayment:
    def test_no_shop_id_returns_none(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "")
        monkeypatch.setattr(pmod, "SECRET_KEY", "")
        assert pmod.create_payment(Plan.PRO, telegram_id=123) is None

    def test_no_telegram_or_user_id_returns_none(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop")
        monkeypatch.setattr(pmod, "SECRET_KEY", "key")
        assert pmod.create_payment(Plan.PRO, telegram_id=None, user_id=None) is None

    def test_create_payment_success(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop123")
        monkeypatch.setattr(pmod, "SECRET_KEY", "secret")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "confirmation": {"confirmation_url": "https://pay.yookassa.ru/confirm"}
        })

        with patch("httpx.post", return_value=mock_response):
            url = pmod.create_payment(Plan.PRO, telegram_id=12345)
        assert url == "https://pay.yookassa.ru/confirm"

    def test_create_payment_web_user(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop123")
        monkeypatch.setattr(pmod, "SECRET_KEY", "secret")

        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json = MagicMock(return_value={
            "confirmation": {"confirmation_url": "https://pay.yookassa.ru/web"}
        })

        with patch("httpx.post", return_value=mock_response):
            url = pmod.create_payment(Plan.BASIC, user_id=42)
        assert url == "https://pay.yookassa.ru/web"

    def test_create_payment_http_error(self, monkeypatch):
        from tidal_dl_ru.bot.users import Plan
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop123")
        monkeypatch.setattr(pmod, "SECRET_KEY", "secret")

        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.post", return_value=mock_response):
            url = pmod.create_payment(Plan.PRO, telegram_id=12345)
        assert url is None


class TestProcessPaymentCanceled:
    def test_canceled_verified(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop")
        monkeypatch.setattr(pmod, "SECRET_KEY", "key")
        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: {"status": "canceled", "metadata": {"plan": "pro"}})

        body = {"event": "payment.canceled", "object": {"id": "pay_cancel"}}
        assert pmod.process_webhook(body) is True

    def test_canceled_unverified(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: None)
        body = {"event": "payment.canceled", "object": {"id": "pay_cancel"}}
        assert pmod.process_webhook(body) is False

    def test_canceled_wrong_status(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "_fetch_payment", lambda pid: {"status": "succeeded"})
        body = {"event": "payment.canceled", "object": {"id": "pay_cancel"}}
        assert pmod.process_webhook(body) is False

    def test_canceled_no_payment_id(self):
        from tidal_dl_ru.server.payments import process_webhook

        body = {"event": "payment.canceled", "object": {}}
        assert process_webhook(body) is False


class TestFetchPayment:
    def test_no_credentials_returns_none(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "")
        monkeypatch.setattr(pmod, "SECRET_KEY", "")
        assert pmod._fetch_payment("pay_123") is None

    def test_http_error_returns_none(self, monkeypatch):
        import httpx

        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop")
        monkeypatch.setattr(pmod, "SECRET_KEY", "key")

        with patch("httpx.get", side_effect=httpx.HTTPError("timeout")):
            assert pmod._fetch_payment("pay_123") is None

    def test_non_200_returns_none(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop")
        monkeypatch.setattr(pmod, "SECRET_KEY", "key")

        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.get", return_value=mock_response):
            assert pmod._fetch_payment("pay_123") is None

    def test_success_returns_json(self, monkeypatch):
        from tidal_dl_ru.server import payments as pmod

        monkeypatch.setattr(pmod, "SHOP_ID", "shop")
        monkeypatch.setattr(pmod, "SECRET_KEY", "key")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"status": "succeeded"})

        with patch("httpx.get", return_value=mock_response):
            result = pmod._fetch_payment("pay_123")
        assert result == {"status": "succeeded"}
