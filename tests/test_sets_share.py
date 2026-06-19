"""API tests for saved sets and share links."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tests.conftest import register_and_login
from tidal_dl_ru.server.app import app


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_sets.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    headers, _uname = register_and_login(client, username="setsuser", email="sets@test.local")
    return headers


SET_URL = "https://www.youtube.com/watch?v=testset123"


class TestSavedSets:
    def test_upsert_list_delete_set(self, client, auth_headers):
        created = client.post(
            "/api/sets",
            json={
                "url": SET_URL,
                "title": "Friday Mix",
                "tracks": [{"title": "A", "duration": 180}, {"title": "B", "duration": 200}],
            },
            headers=auth_headers,
        )
        assert created.status_code == 200
        body = created.json()
        assert body["title"] == "Friday Mix"
        assert body["track_count"] == 2
        assert body["duration_seconds"] == 380

        listed = client.get("/api/sets", headers=auth_headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 1

        updated = client.post(
            "/api/sets",
            json={"url": SET_URL, "title": "Friday Mix v2"},
            headers=auth_headers,
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Friday Mix v2"
        assert len(client.get("/api/sets", headers=auth_headers).json()) == 1

        deleted = client.delete(f"/api/sets/{body['id']}", headers=auth_headers)
        assert deleted.status_code == 200
        assert client.get("/api/sets", headers=auth_headers).json() == []

    def test_sets_require_auth(self, client):
        assert client.get("/api/sets").status_code == 401


class TestShare:
    def test_share_and_claim_playlist(self, client, auth_headers):
        pl = client.post("/api/playlists", json={"name": "Share Me"}, headers=auth_headers).json()
        tracks = [{"provider_id": "9", "title": "T", "duration": 240, "provider": "tidal"}]
        client.put(f"/api/playlists/{pl['id']}", json={"tracks": tracks}, headers=auth_headers)

        share = client.post(f"/api/playlists/{pl['id']}/share", headers=auth_headers)
        assert share.status_code == 200
        token = share.json()["token"]
        assert token

        preview = client.get(f"/api/share/{token}")
        assert preview.status_code == 200
        prev = preview.json()
        assert prev["kind"] == "playlist"
        assert prev["track_count"] == 1
        assert prev["duration_seconds"] == 240

        headers2, _ = register_and_login(client, username="otheruser", email="other@test.local")

        claimed = client.post(f"/api/share/{token}/claim", headers=headers2)
        assert claimed.status_code == 200
        assert claimed.json()["kind"] == "playlist"
        pls = client.get("/api/playlists", headers=headers2).json()
        assert len(pls) == 1
        assert json.loads(pls[0]["tracks_json"])[0]["provider_id"] == tracks[0]["provider_id"]

    def test_claim_playlist_merges_into_existing_same_name(self, client, auth_headers):
        pl = client.post("/api/playlists", json={"name": "Mix"}, headers=auth_headers).json()
        client.put(
            f"/api/playlists/{pl['id']}",
            json={"tracks": [{"provider_id": "1", "title": "A", "duration": 100, "provider": "tidal"}]},
            headers=auth_headers,
        )
        token = client.post(f"/api/playlists/{pl['id']}/share", headers=auth_headers).json()["token"]

        headers2, _ = register_and_login(client, username="mix2user", email="mix2@test.local")

        first = client.post(f"/api/share/{token}/claim", headers=headers2)
        assert first.status_code == 200
        assert first.json()["already_had"] is False

        client.put(
            f"/api/playlists/{pl['id']}",
            json={
                "tracks": [
                    {"provider_id": "1", "title": "A", "duration": 100, "provider": "tidal"},
                    {"provider_id": "2", "title": "B", "duration": 200, "provider": "tidal"},
                ]
            },
            headers=auth_headers,
        )

        second = client.post(f"/api/share/{token}/claim", headers=headers2)
        assert second.status_code == 200
        assert second.json()["already_had"] is False
        pls = client.get("/api/playlists", headers=headers2).json()
        tracks = json.loads(pls[0]["tracks_json"])
        assert len(tracks) == 2

    def test_share_and_claim_set(self, client, auth_headers):
        created = client.post(
            "/api/sets",
            json={"url": SET_URL, "title": "Shared Set", "track_count": 3, "duration_seconds": 600},
            headers=auth_headers,
        ).json()
        share = client.post(f"/api/sets/{created['id']}/share", headers=auth_headers)
        token = share.json()["token"]

        preview = client.get(f"/api/share/{token}").json()
        assert preview["kind"] == "set"
        assert preview["duration_seconds"] == 600

        headers2, _ = register_and_login(client, username="set2user", email="set2@test.local")
        claimed = client.post(f"/api/share/{token}/claim", headers=headers2)
        assert claimed.status_code == 200
        assert claimed.json()["kind"] == "set"
        assert len(client.get("/api/sets", headers=headers2).json()) == 1
