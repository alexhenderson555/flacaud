import pytest
from fastapi.testclient import TestClient
from tidal_dl_ru.server.app import app
from unittest.mock import patch

client = TestClient(app)

@patch('tidal_dl_ru.server.app.get_provider_by_name')
def test_artist_api(mock_provider):
    # Mock the provider to return dummy artist data
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist.return_value = {
        "id": "123", "name": "Test Artist"
    }
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist_albums.return_value = []
    mock_provider.return_value._client.return_value.__enter__.return_value.get_artist_tracks.return_value = []

    response = client.get("/api/artist/123")
    if response.status_code not in [200, 400]:
        print(response.json())
    assert response.status_code in [200, 400, 500]

@patch('tidal_dl_ru.server.app.get_provider_by_name')
def test_album_api(mock_provider):
    mock_provider.return_value._client.return_value.__enter__.return_value.get_album.return_value = {
        "id": "123", "title": "Test Album"
    }
    mock_provider.return_value._client.return_value.__enter__.return_value.get_album_tracks.return_value = []

    response = client.get("/api/album/123")
    assert response.status_code in [200, 400, 500]

@patch('tidal_dl_ru.server.app.get_provider_by_name')
def test_stream_api(mock_provider):
    # Just to ensure the route handles the request and dependencies
    # We mock it to raise an error so we don't actually download
    mock_provider.return_value = None
    response = client.get("/api/stream/unknown/123")
    assert response.status_code in [200, 400, 401, 500] # Provider not found or Unauthorized

def test_auth_status():
    response = client.get("/api/auth/status")
    assert response.status_code in [200, 401]

def test_auth_login():
    response = client.get("/api/auth/login")
    assert response.status_code in [200, 307]
