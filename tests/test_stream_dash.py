"""DASH stream should cache to disk and support HTTP Range (seek)."""

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


async def _fake_to_thread(fn, *args, **kwargs):
    return {
        "type": "dash_stream",
        "manifest": _dash_manifest(),
        "actual_quality": "LOW",
    }


async def _fake_ensure(urls, tmp_path, fmp4_path, final_path, bytes_required=0):
    final_path.parent.mkdir(parents=True, exist_ok=True)
    size = max(bytes_required, 65536) if bytes_required else 65536
    final_path.write_bytes(b"\x00" * size)
    return final_path


def test_dash_stream_supports_range_requests(client, monkeypatch):
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
        "tidal_dl_ru.server.routers.media._ensure_dash_cache",
        _fake_ensure,
    )

    url = f"/api/stream/tidal/{TRACK_ID}?quality=LOW&bypass_registry=true"
    resp = client.get(url, headers={"Range": "bytes=0-1023"})
    assert resp.status_code == 206
    assert resp.headers.get("accept-ranges") == "bytes"
    assert len(resp.content) == 1024
