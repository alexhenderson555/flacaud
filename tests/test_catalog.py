"""Catalog API tests — search pagination and AI playlist fallback."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.core.lyrics import _cleanup_lyrics_lines, parse_lrc_lines
from tidal_dl_ru.core.models import Track
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.routers.ai_playlist import (
    _extract_artist_focus,
    _extract_artist_similar,
    _library_seed_titles_from_query,
    _looks_like_vibe_prompt,
    _vibe_fallback_search_terms,
)

client = TestClient(app)

SAMPLE = Track(
    provider="tidal",
    provider_id="123",
    title="Test Song",
    artists=["Artist"],
    artist_ids=["456"],
    source_url="https://tidal.com/track/123",
    cover_url="https://example.com/cover.jpg",
    duration_s=180,
    year=2020,
    release_date="2020-06-01",
)


@pytest.fixture
def mock_tidal_provider():
    with patch("tidal_dl_ru.server.routers.catalog.get_provider_by_name") as gp, \
         patch("tidal_dl_ru.server.routers.ai_playlist.get_provider_by_name") as gp_ai:
        provider = MagicMock()
        provider.search_page.return_value = ([SAMPLE], True)
        provider.search.return_value = [SAMPLE]
        gp.return_value = provider
        gp_ai.return_value = provider
        yield provider


def test_search_pagination(mock_tidal_provider):
    res = client.post("/api/search", json={"query": "test", "limit": 50, "offset": 0})
    assert res.status_code == 200
    data = res.json()
    assert data["has_more"] is True
    assert len(data["tracks"]) == 1
    mock_tidal_provider.search_page.assert_called_once()


def test_tracks_meta_batch(mock_tidal_provider):
    enriched = SAMPLE.model_copy(update={"provider_id": "9001", "duration_s": 201})
    with patch(
        "tidal_dl_ru.server.routers.catalog._fetch_track_meta_dict",
        side_effect=lambda provider, tid: enriched.model_dump() if tid == "9001" else None,
    ):
        res = client.post(
            "/api/tracks/meta",
            json={"provider": "tidal", "ids": ["9001", "missing"]},
        )
    assert res.status_code == 200
    data = res.json()
    assert len(data["tracks"]) == 1
    assert data["tracks"][0]["provider_id"] == "9001"
    assert data["tracks"][0]["duration_s"] == 201


def test_tracks_meta_batch_rejects_too_many_ids():
    res = client.post(
        "/api/tracks/meta",
        json={"provider": "tidal", "ids": [str(i) for i in range(41)]},
    )
    assert res.status_code == 400


def test_lyrics_cleanup_strips_credits_lines():
    lrc = "\n".join(
        [
            "[00:00.00]制作人: AR/CO",
            "[00:00.50]作曲: Someone / Someone Else",
            "[00:01.00]When I'm with you, fire, fire",
            "[00:02.00]Switching the chemistry",
        ]
    )
    parsed = parse_lrc_lines(lrc)
    cleaned = _cleanup_lyrics_lines(parsed)
    assert [ln["text"] for ln in cleaned] == [
        "When I'm with you, fire, fire",
        "Switching the chemistry",
    ]


def test_lyrics_cleanup_strips_section_markers():
    lrc = "\n".join(
        [
            "[00:00.00]verse:",
            "[00:00.50]pre:",
            "[00:01.00]We're burning up the roof",
            "[00:05.00][Chorus]",
            "[00:05.50]Whenever I'm with you, fire, fire",
            "[00:10.00]bridge 2:",
            "[00:10.50]Sirens at the scene",
        ]
    )
    parsed = parse_lrc_lines(lrc)
    cleaned = _cleanup_lyrics_lines(parsed)
    assert [ln["text"] for ln in cleaned] == [
        "We're burning up the roof",
        "Whenever I'm with you, fire, fire",
        "Sirens at the scene",
    ]


def test_lyrics_timing_suspicious_detects_wrong_track():
    # Simulate a wrong LRC that ends too early vs the real track duration.
    lrc = "\n".join(
        [
            "[00:00.00]Verse:",
            "[00:05.00]Line 1",
            "[00:15.00]Line 2",
        ]
    )
    parsed = parse_lrc_lines(lrc)
    cleaned = _cleanup_lyrics_lines(parsed)
    from tidal_dl_ru.core.lyrics import _timing_looks_suspicious

    assert _timing_looks_suspicious(cleaned, 240) is True


def test_search_layout_queries_corrected_first(mock_tidal_provider):
    calls: list[str] = []

    def search_page(q, limit, offset):
        calls.append(q)
        if q == "Major Lazer":
            return ([SAMPLE], False)
        return ([], False)

    mock_tidal_provider.search_page.side_effect = search_page
    res = client.post("/api/search", json={"query": "ьфщк дфяук", "limit": 20, "offset": 0})
    assert res.status_code == 200
    assert calls[0] == "Major Lazer"
    assert len(res.json()["tracks"]) == 1


def test_library_seed_title_parsing():
    q = (
        "I like these songs: The Daily Mail; Daily Routine. "
        "Give me a radio mix based on this taste."
    )
    assert _library_seed_titles_from_query(q) == ["The Daily Mail", "Daily Routine"]


def test_ai_playlist_library_fallback_does_not_search_daily_word(mock_tidal_provider, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    search_terms: list[str] = []

    def search(term, limit=50):
        search_terms.append(term)
        return [SAMPLE]

    mock_tidal_provider.search.side_effect = search
    q = (
        "I like these songs: The Daily Mail; Daily Routine. "
        "Give me a radio mix based on this taste."
    )
    res = client.post("/api/ai-playlist", json={"query": q, "limit": 5})
    assert res.status_code == 200
    assert not any(t.strip().lower() == "daily" for t in search_terms)
    assert "The Daily Mail" in search_terms


def test_vibe_prompt_detection():
    assert _looks_like_vibe_prompt("погода летняя") is True
    assert _looks_like_vibe_prompt("Radiohead - Creep") is False
    assert _looks_like_vibe_prompt("Artist by Name") is False
    assert _looks_like_vibe_prompt("moojo tracks") is False


def test_extract_artist_focus():
    assert _extract_artist_focus("moojo tracks") == "moojo"
    assert _extract_artist_focus("Moojo songs") == "Moojo"
    assert _extract_artist_focus("tracks by moojo") == "moojo"
    assert _extract_artist_focus("треки Morgenshtern") == "Morgenshtern"
    assert _extract_artist_focus("artist Moojo") == "Moojo"
    assert _extract_artist_focus("tracks like black coffee") is None
    assert _extract_artist_focus("chill tracks") is None
    assert _extract_artist_focus("погода летняя") is None


def test_extract_artist_similar():
    assert _extract_artist_similar("tracks like black coffee") == "black coffee"
    assert _extract_artist_similar("tracks like Black Coffee") == "Black Coffee"
    assert _extract_artist_similar("similar to Daft Punk") == "Daft Punk"
    assert _extract_artist_similar("sounds like Radiohead") == "Radiohead"
    assert _extract_artist_similar("похожие на Morgenshtern") == "Morgenshtern"
    assert _extract_artist_similar("give me tracks in style of moojo") == "moojo"
    assert _extract_artist_similar("tracks in the style of Moojo") == "Moojo"
    assert _extract_artist_similar("in style of moojo") == "moojo"
    assert _extract_artist_similar("moojo style tracks") == "moojo"
    assert _extract_artist_similar("moojo tracks") is None


def test_ai_playlist_artist_similar_uses_radio(mock_tidal_provider, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    neighbour = SAMPLE.model_copy(update={"title": "Drive", "artists": ["&ME"]})

    with patch(
        "tidal_dl_ru.server.routers.ai_playlist._artist_similar_playlist",
        new=AsyncMock(return_value=[neighbour]),
    ) as mock_similar:
        res = client.post(
            "/api/ai-playlist",
            json={"query": "tracks like black coffee", "limit": 5},
        )
    assert res.status_code == 200
    mock_similar.assert_awaited_once_with("black coffee", 5)
    mock_tidal_provider.search.assert_not_called()


def test_ai_playlist_artist_focus_uses_tidal_not_vibe(mock_tidal_provider, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    moojo = SAMPLE.model_copy(update={"title": "Dancing", "artists": ["Moojo"]})

    with patch(
        "tidal_dl_ru.server.routers.ai_playlist._artist_focus_playlist",
        new=AsyncMock(return_value=[moojo]),
    ) as mock_focus:
        res = client.post("/api/ai-playlist", json={"query": "moojo tracks", "limit": 5})
    assert res.status_code == 200
    mock_focus.assert_awaited_once_with("moojo", 5)
    assert res.json()["tracks"][0]["artists"] == ["Moojo"]
    mock_tidal_provider.search.assert_not_called()


def test_vibe_fallback_terms_avoid_literal_first():
    terms = _vibe_fallback_search_terms("погода летняя")
    assert terms[0] != "погода летняя"
    assert any("summer" in t for t in terms)


def test_ai_playlist_vibe_fallback_skips_literal_search(mock_tidal_provider, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    search_terms: list[str] = []

    def search(term, limit=50):
        search_terms.append(term)
        return [SAMPLE]

    mock_tidal_provider.search.side_effect = search
    res = client.post("/api/ai-playlist", json={"query": "погода летняя", "limit": 5})
    assert res.status_code == 200
    assert search_terms
    assert search_terms[0] != "погода летняя"


def test_ai_playlist_tidal_fallback_without_gemini(mock_tidal_provider, monkeypatch):
    # Remove just the Gemini key from the real environ. Patching os.environ.get
    # wholesale would also break the request-logging middleware, which reads
    # TIDALDLRU_SLOW_REQUEST_MS on the same request.
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = client.post("/api/ai-playlist", json={"query": "deep house mix", "limit": 5})
    assert res.status_code == 200
    data = res.json()
    assert len(data["tracks"]) >= 1
    mock_tidal_provider.search.assert_called()


def test_recommendations_endpoint(mock_tidal_provider):
    with patch(
        "tidal_dl_ru.server.routers.catalog.build_recommendations",
        new=AsyncMock(return_value=[SAMPLE]),
    ):
        res = client.get("/api/recommendations?limit=5")
    assert res.status_code == 200
    data = res.json()
    assert len(data["tracks"]) >= 1


def test_recommendations_exclude_returns_empty_instead_of_503():
    with patch(
        "tidal_dl_ru.server.routers.catalog.build_recommendations",
        new=AsyncMock(return_value=[]),
    ) as mock_build:
        res = client.get("/api/recommendations?limit=5&exclude=1,2,3")
    assert res.status_code == 200
    assert res.json()["tracks"] == []
    kwargs = mock_build.await_args.kwargs
    assert kwargs["exclude_ids"] == {"1", "2", "3"}
    assert kwargs["skip_cache"] is True
