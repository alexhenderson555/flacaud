from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app


def test_healthz_reports_db():
    with TestClient(app) as client:
        r = client.get("/healthz")
        assert r.status_code == 200
        body = r.json()
        assert body["db"] is True
        assert "version" in body


def test_rate_limit_jobs_and_warm_endpoints_configured():
    from tidal_dl_ru.server.middleware import _rate_limit_rule

    assert _rate_limit_rule("/api/jobs", "POST") == (60, 12)
    assert _rate_limit_rule("/api/stream/tidal/123/warm", "POST") == (60, 40)
    assert _rate_limit_rule("/api/track/tidal/123/dj-meta", "GET") == (60, 30)
    assert _rate_limit_rule("/healthz", "GET") is None


def test_rate_limit_blocks_excessive_login():
    from tidal_dl_ru.server import middleware as mw

    mw._memory.clear()
    try:
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
    finally:
        mw._memory.clear()
