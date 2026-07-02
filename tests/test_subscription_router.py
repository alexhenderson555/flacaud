"""Tests for subscription router endpoints."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.app import app


def _user(**kwargs) -> User:
    defaults = {"id": 1, "username": "testuser", "plan": "pro"}
    defaults.update(kwargs)
    return User(**defaults)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestSubscriptionStatus:
    def test_requires_auth(self):
        client = TestClient(app)
        assert client.get("/api/subscription/status").status_code == 401

    def test_free_plan(self):
        app.dependency_overrides[get_current_user] = lambda: _user(plan="free")
        client = TestClient(app)
        r = client.get("/api/subscription/status")
        assert r.status_code == 200
        data = r.json()
        assert data["plan"] == "free"
        assert data["days_remaining"] is None

    def test_pro_with_expiry(self):
        exp = datetime.now(timezone.utc) + timedelta(days=10)
        app.dependency_overrides[get_current_user] = lambda: _user(plan="pro", subscription_expires_at=exp)
        client = TestClient(app)
        r = client.get("/api/subscription/status")
        assert r.status_code == 200
        data = r.json()
        assert data["plan"] == "pro"
        assert data["days_remaining"] is not None
        assert data["days_remaining"] >= 9

    def test_expired_subscription_days_zero(self):
        exp = datetime.now(timezone.utc) - timedelta(days=1)
        app.dependency_overrides[get_current_user] = lambda: _user(plan="pro", subscription_expires_at=exp)
        client = TestClient(app)
        r = client.get("/api/subscription/status")
        assert r.status_code == 200
        assert r.json()["days_remaining"] == 0


class TestSubscriptionCancel:
    def test_requires_auth(self):
        client = TestClient(app)
        assert client.post("/api/subscription/cancel").status_code == 401

    def test_free_plan_rejected(self):
        app.dependency_overrides[get_current_user] = lambda: _user(plan="free")
        client = TestClient(app)
        r = client.post("/api/subscription/cancel")
        assert r.status_code == 400
        assert "Nothing to cancel" in r.json()["detail"]

    def test_lifetime_rejected(self):
        app.dependency_overrides[get_current_user] = lambda: _user(plan="lifetime")
        client = TestClient(app)
        r = client.post("/api/subscription/cancel")
        assert r.status_code == 400

    def test_pro_cancel_success(self):
        exp = datetime.now(timezone.utc) + timedelta(days=10)
        user = _user(plan="pro", subscription_expires_at=exp)
        app.dependency_overrides[get_current_user] = lambda: user

        cancelled_user = MagicMock()
        cancelled_user.subscription_expires_at = exp
        cancelled_user.subscription_cancel_at_period_end = True

        with patch("tidal_dl_ru.server.routers.subscription.cancel_at_period_end", return_value=cancelled_user):
            client = TestClient(app)
            r = client.post("/api/subscription/cancel")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["cancel_at_period_end"] is True

    def test_pro_no_expiry_rejected(self):
        app.dependency_overrides[get_current_user] = lambda: _user(plan="pro", subscription_expires_at=None)
        client = TestClient(app)
        r = client.post("/api/subscription/cancel")
        assert r.status_code == 400
