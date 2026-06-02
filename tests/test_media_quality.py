"""Quality probe endpoint — HI_RES fallback chain."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest
from tidal_dl_ru.server.app import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


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


def test_quality_hi_res_returns_string_name(client, monkeypatch):
    manifest = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest="e30=",
    )
    mock_provider = _mock_provider({AudioQuality.HI_RES_LOSSLESS: manifest, AudioQuality.LOSSLESS: manifest})

    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )

    res = client.get("/api/quality/tidal/123?quality=HI_RES")
    assert res.status_code == 200
    assert res.json()["quality"] == "HI_RES_LOSSLESS"


def test_available_qualities_probe(client, monkeypatch):
    hi = PlaybackManifest(trackId=1, audioQuality="HI_RES_LOSSLESS", manifestMimeType="application/vnd.tidal.bts", manifest="e30=")
    lo = PlaybackManifest(trackId=1, audioQuality="LOW", manifestMimeType="application/vnd.tidal.bts", manifest="e30=")
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
    assert data["max_quality"] == "HI_RES"
    assert data["actual"]["HI_RES"] == "HI_RES_LOSSLESS"
