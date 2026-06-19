"""Quality probe endpoint — HI_RES fallback chain."""

import base64
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.database.auth import get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest
from tidal_dl_ru.server.app import app

_FLAC_BTS = base64.b64encode(
    json.dumps(
        {
            "mimeType": "audio/flac",
            "codecs": "flac",
            "encryptionType": "NONE",
            "urls": ["https://example.com/track.flac"],
        }
    ).encode()
).decode()

_AAC_BTS = base64.b64encode(
    json.dumps(
        {
            "mimeType": "audio/mp4",
            "codecs": "mp4a.40.2",
            "encryptionType": "NONE",
            "urls": ["https://example.com/track.m4a"],
        }
    ).encode()
).decode()

_FLAC_DASH = base64.b64encode(
    b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>
<Representation codecs="flac" audioSamplingRate="44100"><SegmentTemplate media="s.m4s"/></Representation>
</AdaptationSet></Period></MPD>"""
).decode()


@pytest.fixture
def client():
    fake_user = User(
        id=1,
        email="t@test",
        username="t",
        hashed_password="x",
        plan="pro",
        subscription_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    app.dependency_overrides.clear()
    app.dependency_overrides[get_media_user] = lambda: fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _mock_provider(manifest_by_quality: dict):
    mock_provider = MagicMock()

    def _client_cm():
        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=cm)
        cm.__exit__ = MagicMock(return_value=False)

        def get_manifest(track_id, q):
            if q not in manifest_by_quality:
                raise RuntimeError("unavailable")
            return manifest_by_quality[q]

        cm.get_playback_manifest = MagicMock(side_effect=get_manifest)
        return cm

    mock_provider._client = _client_cm
    return mock_provider


def test_quality_lossless_returns_sample_rate(client, monkeypatch):
    manifest = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_FLAC_BTS,
        sampleRate=96000,
        bitDepth=24,
    )
    mock_provider = _mock_provider({
        AudioQuality.HI_RES_LOSSLESS: manifest,
        AudioQuality.LOSSLESS: manifest,
    })

    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )

    res = client.get("/api/quality/tidal/123?quality=LOSSLESS")
    assert res.status_code == 200
    data = res.json()
    assert data["quality"] == "HI_RES_LOSSLESS"
    assert data["sample_rate"] == 96000
    assert data["bit_depth"] == 24


def test_available_qualities_probe(client, monkeypatch):
    hi = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_FLAC_BTS,
        sampleRate=96000,
        bitDepth=24,
    )
    lo = PlaybackManifest(
        trackId=1,
        audioQuality="HIGH",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_AAC_BTS,
    )
    mock_provider = _mock_provider({
        AudioQuality.HI_RES_LOSSLESS: hi,
        AudioQuality.LOSSLESS: hi,
        AudioQuality.HIGH: lo,
        AudioQuality.LOW: lo,
    })
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )

    res = client.get("/api/quality/tidal/456/available")
    assert res.status_code == 200
    data = res.json()
    assert "HI_RES" in data["available"]
    assert "LOW" not in data["available"]
    assert data["max_quality"] == "HI_RES"
    assert data["actual"]["HI_RES"] == "HI_RES_LOSSLESS"


def test_available_qualities_no_hi_res_when_manifest_is_lossless_only(client, monkeypatch):
    """HI_RES slot must not appear if Tidal only returns 16-bit FLAC for that probe."""
    lossless = PlaybackManifest(
        trackId=1,
        audioQuality="LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_FLAC_BTS,
        sampleRate=44100,
        bitDepth=16,
    )
    mock_provider = _mock_provider({
        AudioQuality.HI_RES_LOSSLESS: lossless,
        AudioQuality.LOSSLESS: lossless,
        AudioQuality.HIGH: lossless,
    })
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )
    res = client.get("/api/quality/tidal/999/available")
    assert res.status_code == 200
    data = res.json()
    assert "HI_RES" not in data["available"]
    assert "LOSSLESS" in data["available"]
    assert data["max_quality"] == "LOSSLESS"


def test_available_qualities_hides_low_only_track(client, monkeypatch):
    lo = PlaybackManifest(
        trackId=1,
        audioQuality="LOW",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_AAC_BTS,
    )
    mock_provider = _mock_provider({AudioQuality.LOW: lo})
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )
    res = client.get("/api/quality/tidal/789/available")
    assert res.status_code == 200
    data = res.json()
    assert data["available"] == ["HIGH"]
    assert "LOW" not in data["available"]


def test_available_qualities_flac_from_hi_res_slot_only(client, monkeypatch):
    """Typical Tidal: FLAC via HI_RES API request; LOSSLESS slot returns AAC."""
    flac = PlaybackManifest(
        trackId=1,
        audioQuality="LOSSLESS",
        manifestMimeType="application/dash+xml",
        manifest=_FLAC_DASH,
        sampleRate=44100,
        bitDepth=16,
    )
    aac = PlaybackManifest(
        trackId=1,
        audioQuality="HIGH",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_AAC_BTS,
    )
    mock_provider = _mock_provider({
        AudioQuality.HI_RES_LOSSLESS: flac,
        AudioQuality.LOSSLESS: aac,
        AudioQuality.HIGH: aac,
    })
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )
    res = client.get("/api/quality/tidal/335533579/available")
    assert res.status_code == 200
    data = res.json()
    assert "LOSSLESS" in data["available"]
    assert "LOSSLESS" in data["downloadable"]
    assert data["max_quality"] == "LOSSLESS"
    assert data["lossless"]["available"] is True


def test_available_qualities_aac_only_despite_catalog_lossless(client, monkeypatch):
    """Catalog may say LOSSLESS while every manifest is AAC-only."""
    aac = PlaybackManifest(
        trackId=1,
        audioQuality="LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=_AAC_BTS,
    )
    mock_provider = _mock_provider({
        AudioQuality.HI_RES_LOSSLESS: aac,
        AudioQuality.LOSSLESS: aac,
        AudioQuality.HIGH: aac,
    })
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )
    res = client.get("/api/quality/tidal/420064486/available")
    assert res.status_code == 200
    data = res.json()
    assert data["available"] == ["HIGH"]
    assert "LOSSLESS" not in data["available"]
    assert data["lossless"]["available"] is False
