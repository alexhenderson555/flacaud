"""Tests for catalog.py endpoints — covering genres, track meta, radio, providers, dj-meta."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.server.app import app

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
    with patch("tidal_dl_ru.server.routers.catalog.get_provider_by_name") as gp:
        provider = MagicMock()
        provider.search_page.return_value = ([SAMPLE], True)
        provider.search.return_value = [SAMPLE]
        provider.name = "tidal"
        provider.display_name = "Tidal"
        gp.return_value = provider
        yield provider


class TestGenres:
    def test_genres_returns_dict(self):
        res = client.get("/api/genres")
        assert res.status_code == 200
        assert isinstance(res.json(), dict)


class TestProviders:
    def test_providers_list(self):
        res = client.get("/api/providers")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert any(p["name"] == "tidal" for p in data)


class TestTrackMeta:
    def test_track_meta_non_tidal_400(self):
        res = client.get("/api/track/spotify/123")
        assert res.status_code == 400

    def test_track_meta_not_found(self, mock_tidal_provider):
        with patch(
            "tidal_dl_ru.server.routers.catalog._fetch_track_meta_dict",
            return_value=None,
        ):
            res = client.get("/api/track/tidal/999")
        assert res.status_code == 404

    def test_track_meta_success(self, mock_tidal_provider):
        track_dict = SAMPLE.model_dump()
        with patch(
            "tidal_dl_ru.server.routers.catalog._fetch_track_meta_dict",
            return_value=track_dict,
        ):
            res = client.get("/api/track/tidal/123")
        assert res.status_code == 200
        assert res.json()["provider_id"] == "123"


class TestTracksMetaBatch:
    def test_empty_ids(self):
        res = client.post("/api/tracks/meta", json={"provider": "tidal", "ids": []})
        assert res.status_code == 200
        assert res.json()["tracks"] == []

    def test_non_tidal_provider_400(self):
        res = client.post("/api/tracks/meta", json={"provider": "spotify", "ids": ["1"]})
        assert res.status_code == 400

    def test_too_many_ids_400(self):
        res = client.post(
            "/api/tracks/meta",
            json={"provider": "tidal", "ids": [str(i) for i in range(41)]},
        )
        assert res.status_code == 400


class TestTrackRadio:
    def test_non_tidal_400(self):
        res = client.get("/api/track/spotify/123/radio")
        assert res.status_code == 400

    def test_radio_fast(self, mock_tidal_provider):
        with patch(
            "tidal_dl_ru.server.routers.catalog.build_track_radio_fast",
            new=AsyncMock(return_value=[SAMPLE]),
        ):
            res = client.get("/api/track/tidal/123/radio?fast=true&limit=5")
        assert res.status_code == 200
        assert len(res.json()["tracks"]) == 1

    def test_radio_empty_503(self, mock_tidal_provider):
        with patch(
            "tidal_dl_ru.server.routers.catalog.build_track_radio",
            new=AsyncMock(return_value=[]),
        ):
            res = client.get("/api/track/tidal/123/radio?limit=5")
        assert res.status_code == 503


class TestSearchEdgeCases:
    def test_unknown_provider_400(self):
        res = client.post("/api/search", json={"query": "test", "provider": "unknown"})
        assert res.status_code == 400

    def test_search_no_results(self, mock_tidal_provider):
        mock_tidal_provider.search_page.return_value = ([], False)
        mock_tidal_provider.search.return_value = []
        res = client.post("/api/search", json={"query": "xyz", "limit": 10, "offset": 0})
        assert res.status_code == 200
        assert res.json()["tracks"] == []


class TestDjMeta:
    def test_dj_meta_requires_auth(self):
        res = client.get("/api/track/tidal/123/dj-meta")
        # Without auth → 401
        assert res.status_code in (401, 403)


class TestParseExcludeIds:
    def test_too_many_exclude_ids(self):
        res = client.get(f"/api/recommendations?exclude={','.join(str(i) for i in range(251))}")
        assert res.status_code == 400
