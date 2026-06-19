"""Stream resolution must preserve lossless tiers and avoid 96k."""

import base64
import json
from unittest.mock import MagicMock, patch

import pytest

from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest
from tidal_dl_ru.server.streaming import (
    _FAST_START_BYTES,
    _resolve_tidal_stream,
    _stream_quality_candidates,
)


def _bts_manifest(audio_quality: str = "LOSSLESS", *, flac: bool = True) -> PlaybackManifest:
    body = {"urls": ["https://cdn.example/track.flac" if flac else "https://cdn.example/track.m4a"]}
    if flac:
        body["codecs"] = "flac"
        body["mimeType"] = "audio/flac"
    else:
        body["codecs"] = "mp4a.40.2"
        body["mimeType"] = "audio/mp4"
    payload = base64.b64encode(json.dumps(body).encode()).decode()
    return PlaybackManifest(
        trackId=1,
        audioQuality=audio_quality,
        manifestMimeType="application/vnd.tidal.bts",
        manifest=payload,
    )


def _dash_manifest(audio_quality: str = "LOSSLESS", *, flac: bool = True) -> PlaybackManifest:
    codecs = "flac" if flac else "mp4a.40.2"
    xml = (
        f'<?xml version="1.0"?>'
        f'<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>'
        f'<Representation codecs="{codecs}"/>'
        f"</AdaptationSet></Period></MPD>"
    ).encode()
    return PlaybackManifest(
        trackId=1,
        audioQuality=audio_quality,
        manifestMimeType="application/dash+xml",
        manifest=base64.b64encode(xml).decode(),
        sampleRate=44100 if flac else None,
        bitDepth=16 if flac else None,
    )


def test_fast_start_smaller_buffer():
    assert _FAST_START_BYTES == 96 * 1024


def test_lossless_candidates_escalate_to_hi_res_not_high():
    hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    lossless_cands = _stream_quality_candidates(AudioQuality.LOSSLESS)
    assert lossless_cands[0] == AudioQuality.LOSSLESS
    assert AudioQuality.HIGH not in lossless_cands
    if hi is not None:
        assert hi in lossless_cands
        assert AudioQuality.HIGH not in _stream_quality_candidates(hi)
        assert AudioQuality.LOSSLESS in _stream_quality_candidates(hi)


def test_resolve_lossless_skips_aac_bts_and_uses_flac_dash():
    lossless_aac = _bts_manifest("LOSSLESS", flac=False)
    lossless_dash = _dash_manifest("LOSSLESS")
    high_bts = _bts_manifest("HIGH", flac=False)
    calls: list[AudioQuality] = []

    def get_manifest(_track_id, q):
        calls.append(q)
        if q == AudioQuality.LOSSLESS:
            return lossless_aac, False
        hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
        if hi is not None and q == hi:
            return lossless_dash, False
        if q == AudioQuality.HIGH:
            return high_bts, False
        return None, False

    provider = MagicMock()
    with patch(
        "tidal_dl_ru.server.streaming.fetch_playback_manifest",
        side_effect=get_manifest,
    ):
        res = _resolve_tidal_stream(provider, "123", AudioQuality.LOSSLESS)
    assert res["type"] == "dash_stream"
    assert AudioQuality.LOSSLESS in calls


def test_resolve_hi_res_prefers_lossless_bts_over_high_bts():
    hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    if hi is None:
        pytest.skip("HI_RES_LOSSLESS not in enum")

    lossless_bts = _bts_manifest("LOSSLESS")
    high_bts = _bts_manifest("HIGH")

    def get_manifest(_track_id, q):
        if q == hi:
            return None, False
        if q == AudioQuality.LOSSLESS:
            return lossless_bts, False
        if q == AudioQuality.HIGH:
            return high_bts, False
        return None, False

    provider = MagicMock()
    with patch(
        "tidal_dl_ru.server.streaming.fetch_playback_manifest",
        side_effect=get_manifest,
    ):
        res = _resolve_tidal_stream(provider, "123", hi)
    assert res["type"] == "redirect"
    assert res["url"] == "https://cdn.example/track.flac"
