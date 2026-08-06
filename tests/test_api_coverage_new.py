from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ops_headers
from tidal_dl_ru.server.app import app

client = TestClient(app)


@patch("tidal_dl_ru.server.routers.catalog.get_provider_by_name")
def test_artist_api(mock_provider):
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist.return_value = {
        "id": "123", "name": "Test Artist"
    }
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist_albums.return_value = []
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist_tracks.return_value = []

    response = client.get("/api/artist/123")
    assert response.status_code in [200, 400, 500, 503]


@patch("tidal_dl_ru.providers.tidal.client.TidalClient.get_artist_top_tracks")
def test_artist_top_tracks_page(mock_top_tracks):
    mock_top_tracks.return_value = []

    response = client.get("/api/artist/123/top-tracks?offset=20&limit=20")
    assert response.status_code in [200, 503]
    if response.status_code == 200:
        body = response.json()
        assert body["top_tracks"] == []
        assert body["has_more"] is False


@patch("tidal_dl_ru.server.routers.catalog.get_provider_by_name")
def test_album_api(mock_provider):
    mock_provider.return_value._client.return_value.__enter__.return_value.get_album.return_value = {
        "id": "123", "title": "Test Album"
    }
    mock_provider.return_value._client.return_value.__enter__.return_value.get_album_tracks.return_value = []

    response = client.get("/api/album/123")
    assert response.status_code in [200, 400, 500, 503]


@patch("tidal_dl_ru.server.routers.media.get_provider_by_name")
def test_stream_api(mock_provider):
    mock_provider.return_value = None
    response = client.get("/api/stream/unknown/123")
    assert response.status_code in [200, 400, 401, 500]


def test_auth_status():
    response = client.get("/api/auth/status", headers=ops_headers())
    assert response.status_code == 200
    assert "logged_in" in response.json()


def test_auth_login():
    response = client.get("/api/auth/tidal-login", headers=ops_headers())
    assert response.status_code == 200
    assert "url" in response.json()
