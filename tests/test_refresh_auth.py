"""Refresh cookie sessions and email verification."""

import os

from fastapi.testclient import TestClient

from tests.conftest import register_and_login
from tidal_dl_ru.database.auth import sign_email_verify_token
from tidal_dl_ru.database.refresh_tokens import REFRESH_COOKIE_NAME
from tidal_dl_ru.server.app import app


def test_login_sets_refresh_cookie():
    with TestClient(app) as client:
        _, uname = register_and_login(client, username="cookie_user", password="pass-abc-123")
        login = client.post(
            "/api/auth/login",
            data={"username": uname, "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert login.status_code == 200, login.text
        assert REFRESH_COOKIE_NAME in login.cookies
        assert login.json()["access_token"]


def test_refresh_rotates_cookie():
    with TestClient(app) as client:
        _, uname = register_and_login(client, username="rotate_user", password="pass-abc-123")
        login = client.post(
            "/api/auth/login",
            data={"username": uname, "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        cookie1 = login.cookies.get(REFRESH_COOKIE_NAME)
        client.cookies.set(REFRESH_COOKIE_NAME, cookie1, path="/api/auth")

        refresh = client.post("/api/auth/refresh")
        assert refresh.status_code == 200, refresh.text
        body = refresh.json()
        assert body["access_token"]
        cookie2 = refresh.cookies.get(REFRESH_COOKIE_NAME)
        assert cookie2
        assert cookie2 != cookie1


def test_refresh_race_same_cookie_does_not_log_out():
    """Two near-simultaneous /api/auth/refresh calls sharing one still-valid
    cookie (two tabs, or a stale-tab reload) must both succeed within the
    grace window instead of the second one 401ing."""
    with TestClient(app) as client:
        _, uname = register_and_login(client, username="race_user", password="pass-abc-123")
        login = client.post(
            "/api/auth/login",
            data={"username": uname, "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        cookie1 = login.cookies.get(REFRESH_COOKIE_NAME)
        client.cookies.set(REFRESH_COOKIE_NAME, cookie1, path="/api/auth")

        first = client.post("/api/auth/refresh")
        assert first.status_code == 200, first.text

        # Simulate a second tab/load that still holds the pre-rotation cookie.
        client.cookies.set(REFRESH_COOKIE_NAME, cookie1, path="/api/auth")
        second = client.post("/api/auth/refresh")
        assert second.status_code == 200, second.text
        assert second.json()["access_token"]
        assert second.cookies.get(REFRESH_COOKIE_NAME) == first.cookies.get(REFRESH_COOKIE_NAME)


def test_logout_clears_refresh():
    with TestClient(app) as client:
        headers, _ = register_and_login(client, username="logout_user", password="pass-abc-123")
        login = client.post(
            "/api/auth/login",
            data={"username": "logout_user", "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        client.cookies.set(REFRESH_COOKIE_NAME, login.cookies[REFRESH_COOKIE_NAME], path="/api/auth")

        out = client.post("/api/auth/logout")
        assert out.status_code == 200
        refresh = client.post("/api/auth/refresh")
        assert refresh.status_code == 401


def test_register_requires_terms():
    with TestClient(app) as client:
        res = client.post(
            "/api/auth/register",
            json={
                "email": "terms@test.local",
                "username": "terms_user",
                "password": "pass-abc-123",
                "accept_terms": False,
            },
        )
        assert res.status_code == 400


def test_verify_email_marks_user():
    with TestClient(app) as client:
        reg = client.post(
            "/api/auth/register",
            json={
                "email": "verify@test.local",
                "username": "verify_user",
                "password": "pass-abc-123",
                "accept_terms": True,
            },
        )
        assert reg.status_code == 200, reg.text
        user_id = reg.json()["id"]
        assert reg.json()["email_verified"] is False

        token = sign_email_verify_token(user_id)
        verify = client.post("/api/auth/verify-email", json={"token": token})
        assert verify.status_code == 200, verify.text
        assert verify.json()["email_verified"] is True

        login = client.post(
            "/api/auth/login",
            data={"username": "verify_user", "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        access = login.json()["access_token"]
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
        assert me.status_code == 200
        assert me.json()["email_verified"] is True


def test_sentry_init_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SENTRY_DSN", raising=False)
    from tidal_dl_ru.server import sentry_init

    sentry_init.init_sentry()  # should not raise
