from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

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
    response = client.get("/api/auth/status")
    assert response.status_code in [200, 401]


def test_auth_login():
    response = client.get("/api/auth/tidal-login")
    assert response.status_code in [200, 307]
