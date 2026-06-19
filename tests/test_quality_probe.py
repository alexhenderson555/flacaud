"""Tidal quality probe helpers for download resolution."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest

from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.quality_probe import (
    manifest_delivers_ui_tier,
    manifest_ui_tiers,
    pick_download_ui_quality,
    probe_tidal_qualities,
)


def test_pick_download_ui_quality_max_to_flac():
    probe = {"downloadable": ["HIGH", "LOSSLESS"]}
    assert pick_download_ui_quality("HI_RES", probe) == "LOSSLESS"


def test_pick_download_ui_quality_keeps_max():
    probe = {"downloadable": ["HIGH", "LOSSLESS", "HI_RES"]}
    assert pick_download_ui_quality("HI_RES", probe) == "HI_RES"


def test_pick_download_ui_quality_manual_flac():
    probe = {"downloadable": ["HIGH", "LOSSLESS"]}
    assert pick_download_ui_quality("LOSSLESS", probe) == "LOSSLESS"


def test_pick_download_ignores_catalog_only_lossless():
    probe = {
        "available": ["HIGH", "LOSSLESS"],
        "downloadable": ["HIGH"],
        "actual": {"HIGH": "HIGH", "LOSSLESS": "LOSSLESS"},
    }
    assert pick_download_ui_quality("LOSSLESS", probe) == "HIGH"


def test_pick_download_flac_prefers_max_when_no_16bit_manifest():
    probe = {"downloadable": ["HIGH", "HI_RES"]}
    assert pick_download_ui_quality("LOSSLESS", probe) == "HI_RES"


def test_manifest_delivers_requires_real_audio_tier():
    import base64

    dash_aac = SimpleNamespace(
        audio_quality="HIGH",
        manifest_mime_type="application/dash+xml",
        sample_rate=44100,
        bit_depth=16,
        manifest=base64.b64encode(
            b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>
<Representation codecs="mp4a.40.2"><SegmentTemplate media="s.m4s"/></Representation>
</AdaptationSet></Period></MPD>"""
        ).decode(),
    )
    dash_flac = SimpleNamespace(
        audio_quality="HIGH",
        manifest_mime_type="application/dash+xml",
        sample_rate=44100,
        bit_depth=16,
        manifest=base64.b64encode(
            b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>
<Representation codecs="flac"><SegmentTemplate media="s.m4s"/></Representation>
</AdaptationSet></Period></MPD>"""
        ).decode(),
    )
    bts_lossless = SimpleNamespace(
        audio_quality="LOSSLESS",
        manifest_mime_type="application/vnd.tidal.bts",
        sample_rate=None,
        bit_depth=None,
        manifest=base64.b64encode(
            b'{"codecs":"flac","mimeType":"audio/flac","urls":["https://x/a.flac"]}'
        ).decode(),
    )
    assert manifest_delivers_ui_tier(dash_aac, "LOSSLESS") is False
    assert manifest_delivers_ui_tier(dash_flac, "LOSSLESS") is True
    assert manifest_delivers_ui_tier(bts_lossless, "LOSSLESS") is True


def test_manifest_ui_tiers_flac_from_hi_res_slot():
    import base64

    dash_flac_lossless_label = SimpleNamespace(
        audio_quality="LOSSLESS",
        manifest_mime_type="application/dash+xml",
        sample_rate=44100,
        bit_depth=16,
        manifest=base64.b64encode(
            b"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>
<Representation codecs="flac"><SegmentTemplate media="s.m4s"/></Representation>
</AdaptationSet></Period></MPD>"""
        ).decode(),
    )
    assert manifest_delivers_ui_tier(dash_flac_lossless_label, "HI_RES") is False
    assert manifest_delivers_ui_tier(dash_flac_lossless_label, "LOSSLESS") is True
    assert manifest_ui_tiers(dash_flac_lossless_label) == ["LOSSLESS"]


def test_probe_marks_incomplete_when_hi_res_rate_limited(monkeypatch):
    import base64

    aac_bts = base64.b64encode(
        b'{"codecs":"mp4a.40.2","mimeType":"audio/mp4","urls":["https://x/a.m4a"]}'
    ).decode()
    aac = SimpleNamespace(
        audio_quality="HIGH",
        manifest_mime_type="application/vnd.tidal.bts",
        sample_rate=None,
        bit_depth=None,
        manifest=aac_bts,
    )

    def fake_fetch(_track_id, enum_q, client=None):
        if enum_q == AudioQuality.HI_RES_LOSSLESS:
            return None, True
        return aac, False

    monkeypatch.setattr(
        "tidal_dl_ru.providers.tidal.quality_probe.fetch_playback_manifest",
        fake_fetch,
    )
    monkeypatch.setattr("tidal_dl_ru.providers.tidal.quality_probe.time.sleep", lambda _s: None)

    result = probe_tidal_qualities(MagicMock(), "417610873")
    assert result["max_quality"] == "HIGH"
    assert result["lossless"]["available"] is False
    assert result["probe_complete"] is False


def test_probe_catalog_only_lossless_when_api_serves_aac_only(monkeypatch):
    import base64

    aac_bts = base64.b64encode(
        b'{"codecs":"mp4a.40.2","mimeType":"audio/mp4","urls":["https://x/a.m4a"]}'
    ).decode()
    aac = SimpleNamespace(
        audio_quality="HIGH",
        manifest_mime_type="application/vnd.tidal.bts",
        sample_rate=None,
        bit_depth=None,
        manifest=aac_bts,
    )
    track = SimpleNamespace(audio_quality="LOSSLESS")

    client = MagicMock()
    client.get_track.return_value = track

    monkeypatch.setattr(
        "tidal_dl_ru.providers.tidal.quality_probe.fetch_playback_manifest",
        lambda *_a, **_k: (aac, False),
    )

    result = probe_tidal_qualities(client, "423490258")
    assert result["lossless"]["available"] is False
    assert result["lossless"].get("catalog_only") is True
    assert result["probe_complete"] is True
