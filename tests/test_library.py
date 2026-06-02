"""API tests for library and playlist endpoints."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tidal_dl_ru.database.auth import create_access_token
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.app import app


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.auth as auth_mod
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_library.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    monkeypatch.setattr(auth_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    yield
    db_mod.engine = None


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    client.post(
        "/api/auth/register",
        json={"email": "lib@test.local", "username": "libuser", "password": "secret-pass-123"},
    )
    login = client.post(
        "/api/auth/login",
        data={"username": "libuser", "password": "secret-pass-123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


TRACK_PAYLOAD = {
    "provider": "tidal",
    "provider_id": "12345",
    "title": "Test Track",
    "artists_json": '["Artist One"]',
    "cover_url": "https://example.com/cover.jpg",
    "duration": 200,
    "album": "Test Album",
    "quality": "LOSSLESS",
}


class TestLibrary:
    def test_add_and_list_library(self, client, auth_headers):
        r = client.post("/api/library", json=TRACK_PAYLOAD, headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["provider_id"] == "12345"
        assert body["title"] == "Test Track"

        listed = client.get("/api/library", headers=auth_headers)
        assert listed.status_code == 200
        tracks = listed.json()
        assert len(tracks) == 1
        assert tracks[0]["provider_id"] == "12345"

    def test_add_duplicate_returns_existing(self, client, auth_headers):
        r1 = client.post("/api/library", json=TRACK_PAYLOAD, headers=auth_headers)
        r2 = client.post("/api/library", json=TRACK_PAYLOAD, headers=auth_headers)
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

        listed = client.get("/api/library", headers=auth_headers)
        assert len(listed.json()) == 1

    def test_remove_from_library(self, client, auth_headers):
        added = client.post("/api/library", json=TRACK_PAYLOAD, headers=auth_headers).json()
        deleted = client.delete(f"/api/library/{added['id']}", headers=auth_headers)
        assert deleted.status_code == 200
        assert client.get("/api/library", headers=auth_headers).json() == []

    def test_library_requires_auth(self, client):
        assert client.get("/api/library").status_code == 401
        assert client.post("/api/library", json=TRACK_PAYLOAD).status_code == 401


class TestPlaylists:
    def test_create_list_update_playlist(self, client, auth_headers):
        created = client.post(
            "/api/playlists",
            json={"name": "My Mix"},
            headers=auth_headers,
        )
        assert created.status_code == 200
        pl = created.json()
        assert pl["name"] == "My Mix"
        pl_id = pl["id"]

        tracks = [{"provider_id": "1", "title": "A", "artists": ["X"], "provider": "tidal"}]
        updated = client.put(
            f"/api/playlists/{pl_id}",
            json={"tracks": tracks},
            headers=auth_headers,
        )
        assert updated.status_code == 200
        assert json.loads(updated.json()["tracks_json"]) == tracks

        listed = client.get("/api/playlists", headers=auth_headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    def test_delete_playlist(self, client, auth_headers):
        pl_id = client.post("/api/playlists", json={"name": "Temp"}, headers=auth_headers).json()["id"]
        assert client.delete(f"/api/playlists/{pl_id}", headers=auth_headers).status_code == 200
        assert client.get("/api/playlists", headers=auth_headers).json() == []

    def test_update_foreign_playlist_forbidden(self, client, auth_headers):
        token_b = create_access_token({"sub": "other"})
        pl_id = client.post("/api/playlists", json={"name": "Mine"}, headers=auth_headers).json()["id"]
        r = client.put(
            f"/api/playlists/{pl_id}",
            json={"tracks": []},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert r.status_code == 401

    def test_playlists_require_auth(self, client):
        assert client.get("/api/playlists").status_code == 401
