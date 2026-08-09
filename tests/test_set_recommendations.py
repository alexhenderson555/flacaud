"""Set Browser recommendations — artist sampling + genre-query diversity."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tests.conftest import register_and_login
from tidal_dl_ru.database.models import SavedTrack
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.routers.sets import (
    _FALLBACK_DISCOVER_QUERIES,
    _RECENT_FALLBACK_DISCOVER_QUERIES,
    _blend_queries,
)


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401
    from tidal_dl_ru.server import rec_cache

    test_db = tmp_path / "test_set_recommendations.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    # The recommendations endpoint now caches by user id; each test's fresh
    # SQLite DB restarts autoincrement from 1, so without clearing this a
    # later test's user id=1 would see an earlier test's cached results.
    monkeypatch.setattr(rec_cache, "_store", {})
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
    genre_queries = [q for q in queries if q in _FALLBACK_DISCOVER_QUERIES]
    assert len(artist_queries) == 6
    # Plus several genre/event discovery queries mixed in for variety beyond
    # the user's own top artists.
    assert len(genre_queries) == 5


def test_recommendations_lean_genre_heavy_when_date_filtered(client, monkeypatch):
    """A specific artist's own upload volume in a recent window is thin;
    once the date filter is active (provider scoped to SoundCloud), lean
    genre-heavy instead of artist-heavy so there's enough to actually find."""
    headers, _uname = register_and_login(client, username="setrecuser3", email="setrec3@test.local")
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

    resp = client.get("/api/sets/recommendations?provider=soundcloud", headers=headers)
    assert resp.status_code == 200
    queries = captured["queries"]
    artist_queries = [q for q in queries if q not in _FALLBACK_DISCOVER_QUERIES]
    genre_queries = [q for q in queries if q in _FALLBACK_DISCOVER_QUERIES]
    assert len(artist_queries) == 3
    assert len(genre_queries) == 6
    # "boiler room dj set" / "tomorrowland dj set" are swamped by their own
    # all-time-classic uploads (verified empirically: 0/40 results within 30
    # days for either) -- no amount of recency-sorting the fetched pool can
    # surface something recent that was never fetched, so once the date
    # filter is active these two must never be picked at all.
    assert set(genre_queries) <= set(_RECENT_FALLBACK_DISCOVER_QUERIES)
    assert "boiler room dj set" not in genre_queries
    assert "tomorrowland dj set" not in genre_queries


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


def test_recommendations_cached_on_repeat_request(client, monkeypatch):
    """Production logs showed this endpoint occasionally taking 10-50+
    seconds (up to 11 concurrent yt-dlp searches) -- caching the built list
    means a repeat visit/refetch within the TTL is instant instead of paying
    that cost again, which is also what actually stops the frontend's
    request-timeout from silently blanking the grid on a slow reload."""
    headers, _uname = register_and_login(client, username="setrecuser4", email="setrec4@test.local")

    call_count = {"n": 0}

    def fake_blend_queries(queries, limit, exclude, sources=("youtube", "soundcloud")):
        call_count["n"] += 1

        async def _one():
            return [{"url": "https://example.com/set", "title": "Set"}]
        return _one()

    import tidal_dl_ru.server.routers.sets as sets_mod
    monkeypatch.setattr(sets_mod, "_blend_queries", fake_blend_queries)

    first = client.get("/api/sets/recommendations?limit=12", headers=headers)
    second = client.get("/api/sets/recommendations?limit=12", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["results"] == second.json()["results"]
    assert call_count["n"] == 1


@pytest.mark.asyncio
async def test_blend_queries_keeps_a_big_per_query_slice_for_single_source(monkeypatch):
    """Blending many queries for a date-filtered (single-source) call must not
    shrink each query's own result count too far -- search_sets' relevance
    ranking only weights recency, it doesn't guarantee it, so a tiny
    per-query slice can discard every genuinely-recent item before the
    caller's hard date cutoff ever sees them."""
    import tidal_dl_ru.server.routers.sets as sets_mod

    captured_limits = []

    def fake_search_sets(query, limit, sources=("youtube", "soundcloud")):
        captured_limits.append(limit)
        return []

    monkeypatch.setattr(sets_mod, "search_sets", fake_search_sets)
    queries = [f"artist{i} dj set" for i in range(8)]
    await _blend_queries(queries, 36, exclude=set(), sources=("soundcloud",))
    # Each of the 8 queries must keep a large slice (not limit // 8).
    assert all(lim >= 36 for lim in captured_limits)
