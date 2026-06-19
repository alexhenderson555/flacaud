"""Password reset flow tests."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_and_login
from tidal_dl_ru.database.auth import sign_password_reset_token, verify_password_reset_token
from tidal_dl_ru.server.app import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_password_reset_token_roundtrip():
    token = sign_password_reset_token(42)
    assert verify_password_reset_token(token) == 42
    assert verify_password_reset_token(token + "x") is None


def test_forgot_password_always_ok(client):
    with patch("tidal_dl_ru.server.routers.auth.send_password_reset_email") as send:
        res = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    send.assert_not_called()


def test_forgot_password_queues_email_for_known_user(client):
    _, uname = register_and_login(client, username="pwuser", email="pw@test.local")
    assert uname == "pwuser"

    with patch("tidal_dl_ru.server.routers.auth.send_password_reset_email") as send:
        res = client.post("/api/auth/forgot-password", json={"email": "pw@test.local"})
    assert res.status_code == 200
    send.assert_called_once()
    kwargs = send.call_args.kwargs
    assert kwargs["to_email"] == "pw@test.local"
    assert "/reset-password?token=" in kwargs["reset_url"]


def test_send_password_reset_via_resend(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "FlacAud <noreply@test.local>")

    with patch("tidal_dl_ru.server.email_outbound.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value.status_code = 200
        ok = __import__(
            "tidal_dl_ru.server.email_outbound", fromlist=["send_password_reset_email"]
        ).send_password_reset_email(
            to_email="user@example.com",
            reset_url="https://flacaud.ru/reset-password?token=abc",
            username="user",
        )
    assert ok is True
    client.post.assert_called_once()


def test_reset_password_updates_hash_and_allows_login(client):
    headers, uname = register_and_login(
        client,
        username="resetme",
        email="reset@test.local",
        password="old-pass-123",
    )
    assert headers

    from sqlmodel import Session, select

    from tidal_dl_ru.database.database import engine
    from tidal_dl_ru.database.models import User

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == uname)).one()
        token = sign_password_reset_token(user.id)
    res = client.post(
        "/api/auth/reset-password",
        json={"token": token, "password": "new-pass-456"},
    )
    assert res.status_code == 200, res.text

    bad = client.post(
        "/api/auth/login",
        data={"username": uname, "password": "old-pass-123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/auth/login",
        data={"username": uname, "password": "new-pass-456"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert ok.status_code == 200, ok.text


def test_reset_password_rejects_bad_token(client):
    res = client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-valid-token", "password": "new-pass-456"},
    )
    assert res.status_code == 400
