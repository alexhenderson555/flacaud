"""MSE streaming endpoint: raw DASH segments, isolated from the local
stream-cache/remux pipeline that ``/api/stream/{provider}/{track_id}`` uses."""

import base64
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal.models import PlaybackManifest
from tidal_dl_ru.server.app import app
import tidal_dl_ru.server.streaming as streaming_mod

TRACK_ID = "mse-test-424242"

DASH_XML = b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet>
      <Representation codecs="flac">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1">
          <SegmentTimeline><S d="1000000" r="1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>"""

SEGMENT_BODIES = {
    "https://cdn.example/init.mp4": b"INIT_SEGMENT_BYTES",
    "https://cdn.example/seg-1.m4s": b"MEDIA_SEGMENT_ONE",
}


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
def clear_resolve_cache():
    for q in ("LOSSLESS", "HI_RES_LOSSLESS", "HIGH"):
        streaming_mod._dash_resolve_cache.pop(f"{TRACK_ID}:{q}", None)
    yield
    for q in ("LOSSLESS", "HI_RES_LOSSLESS", "HIGH"):
        streaming_mod._dash_resolve_cache.pop(f"{TRACK_ID}:{q}", None)


def _dash_manifest():
    return PlaybackManifest(
        trackId=999,
        audioQuality="LOSSLESS",
        manifestMimeType="application/dash+xml",
        manifest=base64.b64encode(DASH_XML).decode(),
    )


async def _fake_to_thread_dash(fn, *args, **kwargs):
    return {
        "type": "dash_stream",
        "manifest": _dash_manifest(),
        "actual_quality": "LOSSLESS",
    }


async def _fake_to_thread_redirect(fn, *args, **kwargs):
    return {"type": "redirect", "url": "https://cdn.example/full.m4a", "actual_quality": "HIGH"}


class _FakeStreamResp:
    def __init__(self, body: bytes):
        self._body = body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def raise_for_status(self):
        pass

    async def aiter_bytes(self, chunk_size=256 * 1024):
        yield self._body


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def stream(self, method, url):
        return _FakeStreamResp(SEGMENT_BODIES[url])


def _patch_common(monkeypatch):
    monkeypatch.setattr(
        "tidal_dl_ru.providers.tidal.download._stream_urls_from_dash",
        lambda decoded: (list(SEGMENT_BODIES.keys()), "flac"),
    )
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: MagicMock() if name == "tidal" else None,
    )
    monkeypatch.setattr("tidal_dl_ru.server.streaming.httpx.AsyncClient", _FakeAsyncClient)


def test_mse_stream_returns_segments_in_order(client, monkeypatch):
    _patch_common(monkeypatch)
    monkeypatch.setattr("tidal_dl_ru.server.routers.media.asyncio.to_thread", _fake_to_thread_dash)

    resp = client.get(f"/api/stream/tidal/{TRACK_ID}/mse?quality=LOSSLESS")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/mp4")
    assert 'codecs="flac"' in resp.headers["content-type"]
    assert resp.content == b"INIT_SEGMENT_BYTES" + b"MEDIA_SEGMENT_ONE"


def test_mse_stream_rejects_non_dash_tracks(client, monkeypatch):
    _patch_common(monkeypatch)
    monkeypatch.setattr("tidal_dl_ru.server.routers.media.asyncio.to_thread", _fake_to_thread_redirect)

    resp = client.get(f"/api/stream/tidal/{TRACK_ID}/mse?quality=HIGH")
    assert resp.status_code == 400


def test_mse_stream_rejects_non_tidal_provider(client):
    resp = client.get(f"/api/stream/spotify/{TRACK_ID}/mse")
    assert resp.status_code == 400
