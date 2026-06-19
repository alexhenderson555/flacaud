from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app

client = TestClient(app)


def test_client_error_ingest():
    res = client.post(
        "/api/client-errors",
        json={
            "message": "ReferenceError: foo is not defined",
            "stack": "at Account.jsx:42",
            "url": "https://flacaud.ru/account",
            "component": "error_boundary",
        },
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_internal_metrics_from_testclient():
    res = client.get(
        "/internal/metrics/prometheus",
        headers={"X-Forwarded-For": "172.18.0.2"},
    )
    assert res.status_code == 200
    body = res.text
    assert "flacaud_uptime_seconds" in body
    assert "flacaud_health_ok" in body
    assert "flacaud_tidal_pool_healthy" in body
