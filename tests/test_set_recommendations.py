"""Set Browser recommendations — artist sampling + genre-query diversity."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tests.conftest import register_and_login
from tidal_dl_ru.database.models import SavedTrack
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.routers.sets import _FALLBACK_DISCOVER_QUERIES


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_set_recommendations.db"
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


def _seed_saved_tracks(user_id: int, artists: list[str]):
    from tidal_dl_ru.database.database import get_session

    session = next(get_session())
    for i, name in enumerate(artists):
        session.add(SavedTrack(
            user_id=user_id, provider="tidal", provider_id=str(i),
            title=f"Track {i}", artists_json=json.dumps([name]),
        ))
    session.commit()


def test_recommendations_sample_more_than_three_library_artists(client, monkeypatch):
    headers, uname = register_and_login(client, username="setrecuser", email="setrec@test.local")
    me = client.get("/api/auth/me", headers=headers).json()
    _seed_saved_tracks(me["id"], [f"Artist{i}" for i in range(10)])

    captured = {}

    def fake_blend_queries(queries, limit, exclude, sources=("youtube", "soundcloud")):
        captured["queries"] = queries

        async def _empty():
            return []
        return _empty()

    import tidal_dl_ru.server.routers.sets as sets_mod
    monkeypatch.setattr(sets_mod, "_blend_queries", fake_blend_queries)

    resp = client.get("/api/sets/recommendations", headers=headers)
    assert resp.status_code == 200
    queries = captured["queries"]
    # Up to 6 distinct library artists, not just 3.
    artist_queries = [q for q in queries if q not in _FALLBACK_DISCOVER_QUERIES]
    assert len(artist_queries) == 6
    # Plus a couple of genre/event discovery queries mixed in for variety
    # beyond the user's own top artists.
    assert any(q in _FALLBACK_DISCOVER_QUERIES for q in queries)


def test_recommendations_fallback_queries_without_library(client, monkeypatch):
    headers, _uname = register_and_login(client, username="setrecuser2", email="setrec2@test.local")

    captured = {}

    def fake_blend_queries(queries, limit, exclude, sources=("youtube", "soundcloud")):
        captured["queries"] = queries

        async def _empty():
            return []
        return _empty()

    import tidal_dl_ru.server.routers.sets as sets_mod
    monkeypatch.setattr(sets_mod, "_blend_queries", fake_blend_queries)

    resp = client.get("/api/sets/recommendations", headers=headers)
    assert resp.status_code == 200
    assert all(q in _FALLBACK_DISCOVER_QUERIES for q in captured["queries"])
