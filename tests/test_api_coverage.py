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

def test_image_proxy_ssrf():
    response = client.get("/api/image-proxy?url=http://localhost:6379")
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid URL"}

def test_image_proxy_aws():
    response = client.get("/api/image-proxy?url=http://169.254.169.254/latest/meta-data/")
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid URL"}

def test_auth_status():
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert "logged_in" in response.json()
