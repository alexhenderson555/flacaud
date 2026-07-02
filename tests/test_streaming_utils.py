"""Tests for streaming.py utility functions — no Tidal API needed."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.server.streaming import (
    _bts_cache_ext,
    _bts_size_meta_path,
    _dash_total_meta_path,
    _merge_lock_path,
    _qname,
    _range_start_from_request,
    _read_bts_size_meta,
    _read_dash_resource_total,
    api_detail,
    bts_cache_path,
    cap_bts_range,
    dash_file_media_type,
    dash_stream_bytes_needed,
    find_merged_dash_file,
    quality_to_enum,
    range_bytes_needed,
    requires_full_file_before_play,
    stream_cache_dir,
    stream_quality_candidates,
)


class TestQualityToEnum:
    def test_high(self):
        assert quality_to_enum("HIGH") == AudioQuality.HIGH

    def test_lossless(self):
        assert quality_to_enum("LOSSLESS") == AudioQuality.LOSSLESS

    def test_hi_res_maps_to_hi_res_lossless(self):
        hi = getattr(AudioQuality, "HI_RES_LOSSLESS", AudioQuality.LOSSLESS)
        assert quality_to_enum("HI_RES") == hi

    def test_invalid_falls_back_to_high(self):
        assert quality_to_enum("INVALID") == AudioQuality.HIGH

    def test_lowercase(self):
        assert quality_to_enum("high") == AudioQuality.HIGH


class TestQName:
    def test_enum(self):
        assert _qname(AudioQuality.HIGH) == "HIGH"

    def test_string(self):
        assert _qname("lossless") == "LOSSLESS"


class TestApiDetail:
    def test_basic(self):
        d = api_detail("ERR_001", "Something went wrong")
        assert d == {"code": "ERR_001", "message": "Something went wrong"}


class TestMergeLockPath:
    def test_basic(self):
        assert _merge_lock_path(Path("/tmp/track.flac")) == Path("/tmp/track.flac.merge.lock")


class TestDashTotalMetaPath:
    def test_basic(self):
        assert _dash_total_meta_path(Path("/tmp/track.fmp4")) == Path("/tmp/track.fmp4.total")


class TestReadDashResourceTotal:
    def test_final_file_exists(self, tmp_path):
        final = tmp_path / "track.flac"
        final.write_bytes(b"x" * 500)
        result = _read_dash_resource_total(tmp_path / "track.part", tmp_path / "track.merge", final)
        assert result == 500

    def test_merge_file_exists(self, tmp_path):
        merge = tmp_path / "track.merge"
        merge.write_bytes(b"x" * 300)
        result = _read_dash_resource_total(tmp_path / "track.part", merge, tmp_path / "track.flac")
        assert result == 300

    def test_meta_file(self, tmp_path):
        part = tmp_path / "track.part"
        meta = _dash_total_meta_path(part)
        meta.write_text("1024")
        result = _read_dash_resource_total(part, tmp_path / "track.merge", tmp_path / "track.flac")
        assert result == 1024

    def test_meta_zero_returns_none(self, tmp_path):
        part = tmp_path / "track.part"
        _dash_total_meta_path(part).write_text("0")
        result = _read_dash_resource_total(part, tmp_path / "track.merge", tmp_path / "track.flac")
        assert result is None

    def test_meta_invalid_returns_none(self, tmp_path):
        part = tmp_path / "track.part"
        _dash_total_meta_path(part).write_text("not-a-number")
        result = _read_dash_resource_total(part, tmp_path / "track.merge", tmp_path / "track.flac")
        assert result is None

    def test_nothing_exists(self, tmp_path):
        result = _read_dash_resource_total(
            tmp_path / "track.part", tmp_path / "track.merge", tmp_path / "track.flac"
        )
        assert result is None


class TestBtsCacheExt:
    def test_flac(self):
        assert _bts_cache_ext("https://cdn.example/track.flac") == ".flac"

    def test_m4a(self):
        assert _bts_cache_ext("https://cdn.example/track.m4a") == ".m4a"

    def test_mp4(self):
        assert _bts_cache_ext("https://cdn.example/track.mp4") == ".m4a"

    def test_unknown_defaults_flac(self):
        assert _bts_cache_ext("https://cdn.example/track") == ".flac"


class TestBtsCachePath:
    def test_basic(self):
        p = bts_cache_path(Path("/cache"), "123", AudioQuality.HIGH, "https://cdn.example/track.flac")
        assert p == Path("/cache/123_HIGH.flac")

    def test_m4a(self):
        p = bts_cache_path(Path("/cache"), "456", AudioQuality.LOSSLESS, "https://cdn.example/track.m4a")
        assert p == Path("/cache/456_LOSSLESS.m4a")


class TestBtsSizeMetaPath:
    def test_basic(self):
        assert _bts_size_meta_path(Path("/cache/track.flac")) == Path("/cache/track.flac.size")


class TestReadBtsSizeMeta:
    def test_valid(self, tmp_path):
        dest = tmp_path / "track.flac"
        _bts_size_meta_path(dest).write_text("2048")
        assert _read_bts_size_meta(dest) == 2048

    def test_no_file(self, tmp_path):
        assert _read_bts_size_meta(tmp_path / "nonexistent.flac") is None

    def test_zero_returns_none(self, tmp_path):
        dest = tmp_path / "track.flac"
        _bts_size_meta_path(dest).write_text("0")
        assert _read_bts_size_meta(dest) is None

    def test_invalid_returns_none(self, tmp_path):
        dest = tmp_path / "track.flac"
        _bts_size_meta_path(dest).write_text("abc")
        assert _read_bts_size_meta(dest) is None


class TestCapBtsRange:
    def test_no_header(self):
        result = cap_bts_range(None)
        assert result.startswith("bytes=0-")

    def test_non_bytes_header(self):
        result = cap_bts_range("items=0-10")
        assert result.startswith("bytes=0-")

    def test_suffix_range(self):
        assert cap_bts_range("bytes=-500") == "bytes=-500"

    def test_open_ended_from_zero(self):
        result = cap_bts_range("bytes=0-")
        assert result.startswith("bytes=0-")
        assert result != "bytes=0-"

    def test_small_range_from_zero_passes(self):
        result = cap_bts_range("bytes=0-100")
        assert result == "bytes=0-100"

    def test_large_range_from_zero_capped(self):
        result = cap_bts_range("bytes=0-1048576")
        assert result == "bytes=0-524287"

    def test_non_zero_start_passes(self):
        assert cap_bts_range("bytes=100-200") == "bytes=100-200"


class TestRangeStartFromRequest:
    def _req(self, range_header=None):
        req = MagicMock()
        if range_header is not None:
            req.headers = {"range": range_header}
        else:
            req.headers = {}
        return req

    def test_no_header(self):
        assert _range_start_from_request(self._req()) == 0

    def test_non_bytes(self):
        assert _range_start_from_request(self._req("items=0-10")) == 0

    def test_suffix(self):
        assert _range_start_from_request(self._req("bytes=-500")) == 0

    def test_normal(self):
        assert _range_start_from_request(self._req("bytes=100-200")) == 100

    def test_empty_start(self):
        assert _range_start_from_request(self._req("bytes=-200")) == 0

    def test_invalid(self):
        assert _range_start_from_request(self._req("bytes=abc-200")) == 0


class TestRangeBytesNeeded:
    def _req(self, range_header=None):
        req = MagicMock()
        if range_header is not None:
            req.headers = {"range": range_header}
        else:
            req.headers = {}
        return req

    def test_no_header(self):
        result = range_bytes_needed(self._req())
        assert result >= 96 * 1024

    def test_suffix_range(self):
        assert range_bytes_needed(self._req("bytes=-500")) == 0

    def test_normal_range(self):
        result = range_bytes_needed(self._req("bytes=0-100"))
        assert result >= 100 + 1

    def test_invalid_range(self):
        result = range_bytes_needed(self._req("bytes=abc"))
        assert result >= 96 * 1024


class TestRequiresFullFileBeforePlay:
    def test_lossless(self):
        assert requires_full_file_before_play(AudioQuality.LOSSLESS) is True

    def test_high(self):
        assert requires_full_file_before_play(AudioQuality.HIGH) is False

    def test_hi_res(self):
        hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
        if hi is not None:
            assert requires_full_file_before_play(hi) is True


class TestDashStreamBytesNeeded:
    def test_always_zero(self):
        req = MagicMock()
        req.headers = {}
        assert dash_stream_bytes_needed(req) == 0


class TestFindMergedDashFile:
    def test_found_flac(self, tmp_path):
        f = tmp_path / "123_LOSSLESS.flac"
        f.write_bytes(b"x")
        result = find_merged_dash_file(tmp_path, "123", AudioQuality.LOSSLESS)
        assert result == f

    def test_found_m4a(self, tmp_path):
        f = tmp_path / "456_HIGH.m4a"
        f.write_bytes(b"x")
        result = find_merged_dash_file(tmp_path, "456", AudioQuality.HIGH)
        assert result == f

    def test_not_found(self, tmp_path):
        result = find_merged_dash_file(tmp_path, "999", AudioQuality.LOSSLESS)
        assert result is None


class TestDashFileMediaType:
    def test_flac(self, tmp_path):
        assert dash_file_media_type(tmp_path / "track.flac") == "audio/flac"

    def test_m4a(self, tmp_path):
        assert dash_file_media_type(tmp_path / "track.m4a") == "audio/mp4"

    def test_part(self, tmp_path):
        assert dash_file_media_type(tmp_path / "track.fmp4.part") == "audio/mp4"

    def test_fmp4(self, tmp_path):
        assert dash_file_media_type(tmp_path / "track.fmp4") == "audio/mp4"

    def test_unknown(self, tmp_path):
        assert dash_file_media_type(tmp_path / "track.bin") == "audio/mp4"


class TestStreamQualityCandidates:
    def test_high(self):
        assert stream_quality_candidates(AudioQuality.HIGH) == [AudioQuality.HIGH]

    def test_lossless(self):
        cands = stream_quality_candidates(AudioQuality.LOSSLESS)
        assert cands[0] == AudioQuality.LOSSLESS

    def test_hi_res(self):
        hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
        if hi is not None:
            cands = stream_quality_candidates(hi)
            assert hi in cands
            assert AudioQuality.LOSSLESS in cands
