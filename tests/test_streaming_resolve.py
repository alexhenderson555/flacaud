"""Tests for streaming.py resolve/delivered_meta pipeline — Tidal API mocked."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest
from tidal_dl_ru.server.streaming import (
    TidalStreamUnavailable,
    _bts_cache_ext,
    _bts_cache_jobs,
    _bts_size_meta_path,
    _dash_cache_jobs,
    _dash_resolve_cache,
    _manifest_acceptable_for_request,
    _manifest_delivers_lossless,
    _stream_cache_keys,
    delivered_stream_meta,
    quality_to_enum,
    resolve_tidal_stream,
    stream_quality_candidates,
)


def _make_manifest(
    mime: str = "application/vnd.tidal.bts",
    quality: str = "HIGH",
    manifest_data: dict | None = None,
) -> PlaybackManifest:
    if manifest_data is None:
        manifest_data = {"urls": ["https://cdn.example/track.m4a"]}
    raw = base64.b64encode(json.dumps(manifest_data).encode()).decode()
    return PlaybackManifest(
        trackId=1,
        audioQuality=quality,
        manifestMimeType=mime,
        manifest=raw,
    )


class TestStreamCacheKeys:
    def test_high(self):
        keys = _stream_cache_keys(AudioQuality.HIGH)
        assert keys == (AudioQuality.HIGH.name,)

    def test_lossless_includes_hi_res(self):
        keys = _stream_cache_keys(AudioQuality.LOSSLESS)
        assert AudioQuality.LOSSLESS.name in keys

    def test_hi_res_includes_lossless(self):
        hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
        if hi:
            keys = _stream_cache_keys(hi)
            assert hi.name in keys
            assert AudioQuality.LOSSLESS.name in keys


class TestManifestDeliversLossless:
    def test_flac_codec_allowed(self):
        manifest = MagicMock()
        with patch("tidal_dl_ru.server.streaming.lossless_flac_allowed", return_value=True):
            with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", return_value={"codecs": "flac"}):
                result = _manifest_delivers_lossless(manifest, "free")
                assert result is True

    def test_non_flac_codec(self):
        manifest = MagicMock()
        with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", return_value={"codecs": "mp4a.40.2"}):
            result = _manifest_delivers_lossless(manifest, "free")
            assert result is False

    def test_inspect_raises(self):
        manifest = MagicMock()
        with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", side_effect=ValueError):
            result = _manifest_delivers_lossless(manifest, "free")
            assert result is False


class TestManifestAcceptable:
    def test_high_always_acceptable(self):
        assert _manifest_acceptable_for_request(MagicMock(), AudioQuality.HIGH, "free") is True

    def test_lossless_with_flac(self):
        manifest = MagicMock()
        with (
            patch("tidal_dl_ru.server.streaming._manifest_delivers_lossless", return_value=True),
        ):
            assert _manifest_acceptable_for_request(manifest, AudioQuality.LOSSLESS, "free") is True

    def test_lossless_without_flac(self):
        manifest = MagicMock()
        with (
            patch("tidal_dl_ru.server.streaming._manifest_delivers_lossless", return_value=False),
        ):
            assert _manifest_acceptable_for_request(manifest, AudioQuality.LOSSLESS, "free") is False


class TestResolveTidalStreamBts:
    """BTS manifest → redirect type."""

    def test_bts_redirect(self):
        manifest = _make_manifest(
            mime="application/vnd.tidal.bts",
            quality="HIGH",
            manifest_data={"urls": ["https://cdn.example/track.m4a"]},
        )
        p = MagicMock()
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)):
            result = resolve_tidal_stream(p, "123", AudioQuality.HIGH)
        assert result["type"] == "redirect"
        assert result["url"] == "https://cdn.example/track.m4a"

    def test_bts_empty_urls_falls_through(self):
        manifest = _make_manifest(
            mime="application/vnd.tidal.bts",
            quality="HIGH",
            manifest_data={"urls": []},
        )
        p = MagicMock()
        with (
            patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)),
            patch("tidal_dl_ru.server.streaming.stream_cache_dir", return_value=Path("/tmp")),
            patch("tidal_dl_ru.server.streaming.download_track", side_effect=RuntimeError("no urls")),
            patch.object(p, "_client") as ctx,
        ):
            ctx.return_value.__enter__ = MagicMock(return_value=MagicMock())
            ctx.return_value.__exit__ = MagicMock(return_value=False)
            with pytest.raises(TidalStreamUnavailable):
                resolve_tidal_stream(p, "123", AudioQuality.HIGH)


class TestResolveTidalStreamDash:
    """DASH manifest → dash_stream type."""

    def test_dash_stream(self):
        manifest = _make_manifest(
            mime="application/dash+xml",
            quality="LOSSLESS",
        )
        p = MagicMock()
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)):
            with patch(
                "tidal_dl_ru.server.streaming._manifest_acceptable_for_request",
                return_value=True,
            ):
                result = resolve_tidal_stream(p, "456", AudioQuality.LOSSLESS)
        assert result["type"] == "dash_stream"
        assert result["actual_quality"] == "LOSSLESS"


class TestResolveTidalStreamRateLimited:
    def test_rate_limit_raises(self):
        p = MagicMock()
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(None, True)):
            with pytest.raises(TidalStreamUnavailable) as exc_info:
                resolve_tidal_stream(p, "789", AudioQuality.HIGH)
            assert exc_info.value.rate_limited is True

    def test_no_manifest_raises(self):
        p = MagicMock()
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(None, False)):
            with patch("tidal_dl_ru.server.streaming.stream_cache_dir", return_value=Path("/tmp")):
                with patch.object(p, "_client") as ctx:
                    ctx.return_value.__enter__ = MagicMock(return_value=MagicMock())
                    ctx.return_value.__exit__ = MagicMock(return_value=False)
                    with pytest.raises(TidalStreamUnavailable) as exc_info:
                        resolve_tidal_stream(p, "000", AudioQuality.HIGH)
                    assert exc_info.value.rate_limited is False


class TestDeliveredStreamMeta:
    def test_flac_meta(self):
        manifest = _make_manifest(quality="LOSSLESS")
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)):
            with patch("tidal_dl_ru.server.streaming._manifest_acceptable_for_request", return_value=True):
                with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", return_value={"codecs": "flac"}):
                    with patch("tidal_dl_ru.providers.tidal.download.manifest_lossless_meta", return_value=(96, 24)):
                        result = delivered_stream_meta("123", "LOSSLESS")
        assert result["quality"] == "LOSSLESS"
        assert result["sample_rate"] == 96
        assert result["bit_depth"] == 24

    def test_aac_meta(self):
        manifest = _make_manifest(quality="HIGH")
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)):
            with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", return_value={"codecs": "mp4a.40.2"}):
                result = delivered_stream_meta("123", "HIGH")
        assert result["quality"] == "HIGH"
        assert result["sample_rate"] is None
        assert result["bit_depth"] is None

    def test_no_manifest_returns_high(self):
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(None, False)):
            result = delivered_stream_meta("123", "HIGH")
        assert result["quality"] == "HIGH"

    def test_invalid_quality_falls_back_to_high(self):
        manifest = _make_manifest(quality="HIGH")
        with patch("tidal_dl_ru.server.streaming.fetch_playback_manifest", return_value=(manifest, False)):
            with patch("tidal_dl_ru.providers.tidal.download.manifest_inspect", return_value={"codecs": "mp4a.40.2"}):
                result = delivered_stream_meta("123", "INVALID_QUALITY")
        assert result["quality"] == "HIGH"
