from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app

client = TestClient(app)


from tests.conftest import ops_headers, register_and_login


def test_metrics_endpoint():
    res = client.get("/api/metrics", headers=ops_headers())
    assert res.status_code == 200
    data = res.json()
    assert "uptime_sec" in data
    assert data["uptime_sec"] >= 0
    assert "recommendations_cache" in data
    assert "ttl_sec" in data["recommendations_cache"]
    assert "stream_errors" in data
    assert "not_ready" in data["stream_errors"]
    assert "failed" in data["stream_errors"]
    assert "disk" in data


def test_metrics_requires_ops_key_when_configured(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-ops")
    res = client.get("/api/metrics")
    assert res.status_code == 401
