import pytest
from fastapi.testclient import TestClient
from tidal_dl_ru.server.app import app

client = TestClient(app)

def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

def test_providers():
    response = client.get("/api/providers")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

# Addresses that must never be reachable through the proxy. The hardened
# handler resolves the host and rejects any non-public address, so loopback,
# link-local/metadata and RFC1918 are all blocked ("Blocked address").
_BLOCKED = {"Blocked address", "Cannot resolve host", "Invalid URL"}

def test_image_proxy_blocks_loopback():
    response = client.get("/api/image-proxy?url=http://localhost:6379")
    assert response.status_code == 400
    assert response.json()["detail"] in _BLOCKED

def test_image_proxy_blocks_metadata():
    response = client.get("/api/image-proxy?url=http://169.254.169.254/latest/meta-data/")
    assert response.status_code == 400
    assert response.json()["detail"] in _BLOCKED

def test_image_proxy_blocks_private_rfc1918():
    response = client.get("/api/image-proxy?url=http://10.0.0.1/")
    assert response.status_code == 400
    assert response.json()["detail"] in _BLOCKED

def test_image_proxy_rejects_non_http_scheme():
    response = client.get("/api/image-proxy?url=file:///etc/passwd")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid URL"

def test_auth_status():
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert "logged_in" in response.json()
