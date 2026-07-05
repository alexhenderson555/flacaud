"""Recognize endpoint tests (demucs split test removed — Stem Splitter feature removed)."""

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from tests.conftest import register_and_login
from tidal_dl_ru.server.app import app


def test_recognize_endpoint_requires_auth():
    with TestClient(app) as client:
        res = client.post(
            "/api/recognize",
            files={"file": ("clip.mp3", b"fake-audio", "audio/mpeg")},
        )
        assert res.status_code == 401


def test_recognize_endpoint(monkeypatch):
    fake = MagicMock()
    fake.artist = "Artist"
    fake.title = "Song"
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.catalog.recognize_audio",
        AsyncMock(return_value=fake),
    )
    mock_provider = MagicMock()
    mock_provider.search.return_value = []
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.catalog.get_provider_by_name",
        lambda _name: mock_provider,
    )
    with TestClient(app) as client:
        headers, _ = register_and_login(client)
        res = client.post(
            "/api/recognize",
            files={"file": ("clip.mp3", b"fake-audio", "audio/mpeg")},
            headers=headers,
        )
        assert res.status_code == 200
