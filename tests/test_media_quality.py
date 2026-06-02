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


def test_quality_hi_res_returns_string_name(client, monkeypatch):
    manifest = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/vnd.tidal.bts",
        manifest="e30=",  # {}
    )

    mock_provider = MagicMock()

    def _client_cm():
        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=cm)
        cm.__exit__ = MagicMock(return_value=False)
        cm.get_playback_manifest = MagicMock(return_value=manifest)
        return cm

    mock_provider._client = _client_cm

    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.media.get_provider_by_name",
        lambda name: mock_provider if name == "tidal" else None,
    )

    res = client.get("/api/quality/tidal/123?quality=HI_RES")
    assert res.status_code == 200
    assert res.json()["quality"] == "HI_RES_LOSSLESS"
