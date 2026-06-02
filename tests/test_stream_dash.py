"""DASH stream should start before the full track is buffered."""

import base64
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal.models import PlaybackManifest
from tidal_dl_ru.server.app import app

TRACK_ID = "777888999"
CACHE_DIR = Path(tempfile.gettempdir()) / "tidal_stream_cache"

DASH_XML = b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet>
      <Representation codecs="mp4a.40.2">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1">
          <SegmentTimeline><S d="1000000" r="1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>"""


@pytest.fixture
def client():
    fake_user = User(id=1, email="t@test", username="t", hashed_password="x")
    from tidal_dl_ru.database.auth import get_media_user

    app.dependency_overrides.clear()
    app.dependency_overrides[get_media_user] = lambda: fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_stream_cache():
    for p in CACHE_DIR.glob(f"{TRACK_ID}_*"):
        p.unlink(missing_ok=True)
    yield
    for p in CACHE_DIR.glob(f"{TRACK_ID}_*"):
        p.unlink(missing_ok=True)


def _dash_manifest():
    return PlaybackManifest(
        trackId=999,
        audioQuality="LOW",
        manifestMimeType="application/dash+xml",
        manifest=base64.b64encode(DASH_XML).decode(),
    )


async def _fake_to_thread(fn):
    return {
        "type": "dash_stream",
        "manifest": _dash_manifest(),
        "actual_quality": "LOW",
    }


def test_dash_stream_yields_before_all_segments_fetched(client, monkeypatch):
    segment_calls: list[str] = []

    class StreamCM:
        def __init__(self, url):
            segment_calls.append(url)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def raise_for_status(self):
            return None

        async def aiter_bytes(self, chunk_size=65536):
            yield b"\x00" * 32

    mock_client_instance = MagicMock()
    mock_client_instance.stream = lambda method, url, headers=None: StreamCM(url)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(
        "tidal_dl_ru.providers.tidal.download._stream_urls_from_dash",
        lambda decoded: (["https://cdn.example/init.mp4", "https://cdn.example/seg-1.m4s"], "mp4a.40.2"),
    )
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: MagicMock() if name == "tidal" else None,
    )
    monkeypatch.setattr("tidal_dl_ru.server.routers.media.asyncio.to_thread", _fake_to_thread)
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.httpx.AsyncClient",
        lambda *a, **k: mock_client_instance,
    )

    with client.stream("GET", f"/api/stream/tidal/{TRACK_ID}?quality=LOW&bypass_registry=true") as resp:
        assert resp.status_code == 200
        first = next(resp.iter_bytes())
        assert first

    assert segment_calls
    assert "init.mp4" in segment_calls[0]
