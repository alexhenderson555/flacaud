from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app


def test_healthz_reports_db():
    with TestClient(app) as client:
        r = client.get("/healthz")
        assert r.status_code == 200
        body = r.json()
        assert body["db"] is True
        assert "version" in body


def test_rate_limit_blocks_excessive_login():
    with TestClient(app) as client:
        for _ in range(25):
            client.post(
                "/api/auth/login",
                data={"username": "nobody", "password": "wrong"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        r = client.post(
            "/api/auth/login",
            data={"username": "nobody", "password": "wrong"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 429
