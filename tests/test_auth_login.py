"""Login identifier resolution (username or email)."""

from fastapi.testclient import TestClient

from tests.conftest import register_and_login
from tidal_dl_ru.server.app import app


def test_login_with_username():
    with TestClient(app) as client:
        _, uname = register_and_login(
            client,
            username="iduser",
            email="iduser@test.local",
            password="pass-abc-123",
        )
        res = client.post(
            "/api/auth/login",
            data={"username": uname, "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["username"] == uname


def test_login_with_email():
    with TestClient(app) as client:
        register_and_login(
            client,
            username="maillogin",
            email="Mail.Login@test.local",
            password="pass-abc-123",
        )
        res = client.post(
            "/api/auth/login",
            data={"username": "mail.login@test.local", "password": "pass-abc-123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["username"] == "maillogin"


def test_register_stores_email_lowercase():
    with TestClient(app) as client:
        uname = "loweremail_user"
        res = client.post(
            "/api/auth/register",
            json={"email": "Mixed.Case@Example.COM", "username": uname, "password": "pass-abc-123", "accept_terms": True},
        )
        assert res.status_code == 200, res.text
        assert res.json()["email"] == "mixed.case@example.com"
