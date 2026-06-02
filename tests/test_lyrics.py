"""Lyrics lookup with LRCLIB metadata matching."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.core.lyrics import display_title, fetch_lyrics_lines, parse_lrc_lines
from tidal_dl_ru.server.app import app

SAMPLE_LRC = """[00:12.00]First line
[00:18.50]Second line
"""


def test_parse_lrc_lines():
    lines = parse_lrc_lines(SAMPLE_LRC)
    assert len(lines) == 2
    assert lines[0]["text"] == "First line"
    assert lines[1]["time"] == pytest.approx(18.5)


def test_display_title_with_version():
    assert display_title("Song", "Remastered") == "Song (Remastered)"
    assert display_title("Song (Live)", "Live") == "Song (Live)"


@patch("tidal_dl_ru.core.lyrics.fetch_synced_lrc_text")
def test_fetch_lyrics_lines_uses_metadata(mock_fetch):
    mock_fetch.return_value = SAMPLE_LRC
    lines = fetch_lyrics_lines(
        artist="Artist",
        title="Track",
        album="Album",
        duration=245,
        isrc="USRC123",
    )
    assert len(lines) == 2
    mock_fetch.assert_called_once()
    kwargs = mock_fetch.call_args.kwargs
    assert kwargs["artist"] == "Artist"
    assert kwargs["duration"] == 245
    assert kwargs["isrc"] == "USRC123"


def test_parse_lrc_lines_hour_format():
    lines = parse_lrc_lines("[00:01:05.20]Chorus")
    assert len(lines) == 1
    assert lines[0]["time"] == pytest.approx(65.2)


@patch("tidal_dl_ru.core.lyrics._syncedlyrics_search")
@patch("tidal_dl_ru.core.lyrics.fetch_synced_lrc_text")
def test_fetch_lyrics_lines_falls_back_to_query(mock_fetch, mock_synced):
    mock_fetch.return_value = None
    mock_synced.return_value = SAMPLE_LRC
    lines = fetch_lyrics_lines(
        artist="Artist",
        title="Track",
        query="Artist Track live",
    )
    assert len(lines) == 2
    mock_synced.assert_called_once()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@patch("tidal_dl_ru.core.lyrics.fetch_lyrics_lines")
@patch("tidal_dl_ru.server.routers.media.get_provider_by_name")
def test_lyrics_api_accepts_structured_params(mock_provider, mock_fetch, client):
    mock_provider.return_value = None
    mock_fetch.return_value = [{"time": 0.0, "text": "Hello"}]
    r = client.get(
        "/api/lyrics",
        params={
            "artist": "Daft Punk",
            "title": "Instant Crush",
            "album": "Random Access Memories",
            "duration": 337,
            "isrc": "USUM71301367",
            "provider": "tidal",
            "provider_id": "123",
        },
    )
    assert r.status_code == 200
    assert r.json()["lyrics"][0]["text"] == "Hello"
    kwargs = mock_fetch.call_args.kwargs
    assert kwargs["artist"] == "Daft Punk"
    assert kwargs["duration"] == 337


@patch("tidal_dl_ru.server.routers.media.asyncio.to_thread")
@patch("tidal_dl_ru.server.routers.media.get_provider_by_name")
def test_lyrics_api_enriches_from_tidal(mock_provider, mock_thread, client):
    tidal_track = MagicMock()
    tidal_track.artists = [MagicMock(name="Artist")]
    tidal_track.artist = None
    tidal_track.title = "Title"
    tidal_track.album = MagicMock(title="Album")
    tidal_track.duration = 200
    tidal_track.isrc = "ISRC1"
    tidal_track.version = "Remix"

    mock_client = MagicMock()
    mock_client.get_track.return_value = tidal_track
    mock_provider.return_value._client.return_value.__enter__.return_value = mock_client
    mock_provider.return_value._client.return_value.__exit__.return_value = False

    async def _run(fn):
        return fn()

    mock_thread.side_effect = _run

    with patch("tidal_dl_ru.core.lyrics.fetch_lyrics_lines", return_value=[]) as mock_fetch:
        r = client.get("/api/lyrics", params={"title": "Title", "provider": "tidal", "provider_id": "99"})
        assert r.status_code == 200
        kwargs = mock_fetch.call_args.kwargs
        assert kwargs["isrc"] == "ISRC1"
        assert kwargs["album"] == "Album"
        assert kwargs["duration"] == 200
