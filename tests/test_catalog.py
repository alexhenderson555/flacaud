"""Catalog API tests — search pagination and AI playlist fallback."""

from unittest.mock import MagicMock, patch

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
    source_url="https://tidal.com/track/123",
)


@pytest.fixture
def mock_tidal_provider():
    with patch("tidal_dl_ru.server.routers.catalog.get_provider_by_name") as gp:
        provider = MagicMock()
        provider.search_page.return_value = ([SAMPLE], True)
        provider.search.return_value = [SAMPLE]
        gp.return_value = provider
        yield provider


def test_search_pagination(mock_tidal_provider):
    res = client.post("/api/search", json={"query": "test", "limit": 50, "offset": 0})
    assert res.status_code == 200
    data = res.json()
    assert data["has_more"] is True
    assert len(data["tracks"]) == 1
    mock_tidal_provider.search_page.assert_called_once()


def test_ai_playlist_tidal_fallback_without_gemini(mock_tidal_provider):
    with patch("tidal_dl_ru.server.routers.catalog.os.environ.get", return_value=None):
        res = client.post("/api/ai-playlist", json={"query": "deep house mix", "limit": 5})
    assert res.status_code == 200
    data = res.json()
    assert len(data["tracks"]) >= 1
    mock_tidal_provider.search.assert_called()
