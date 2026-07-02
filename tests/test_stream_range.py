from unittest.mock import MagicMock

import pytest

from tidal_dl_ru.server.streaming import (
    _BTS_INITIAL_RANGE_BYTES,
    _FAST_START_BYTES,
    _MIN_RANGE_RESPONSE,
    cap_bts_range,
    dash_stream_bytes_needed,
    range_bytes_needed,
)


def _req(range_header: str | None = None) -> MagicMock:
    r = MagicMock()
    r.headers.get.return_value = range_header
    return r


def test_range_bytes_fast_start_without_header():
    assert range_bytes_needed(_req(None)) == max(_FAST_START_BYTES, _MIN_RANGE_RESPONSE)


def test_range_bytes_fast_start_bytes_zero_dash():
    assert range_bytes_needed(_req("bytes=0-")) == max(_FAST_START_BYTES, _MIN_RANGE_RESPONSE)


def test_range_bytes_seek_needs_more_data():
    assert range_bytes_needed(_req("bytes=500000-")) >= 500_000 + _MIN_RANGE_RESPONSE


def test_range_bytes_suffix_range_waits_for_full_file():
    assert range_bytes_needed(_req("bytes=-1024")) == 0


def test_dash_stream_bytes_needed_waits_for_merged_file():
    assert dash_stream_bytes_needed(_req("bytes=0-65535")) == 0
    assert dash_stream_bytes_needed(_req("bytes=-128")) == 0
    assert dash_stream_bytes_needed(_req("bytes=500000-")) == 0
    assert dash_stream_bytes_needed(_req(None)) == 0


def test_find_merged_dash_file_skips_fmp4(tmp_path):
    from tidal_dl_ru.providers.tidal.models import AudioQuality
    from tidal_dl_ru.server.streaming import find_merged_dash_file

    cache = tmp_path / "cache"
    cache.mkdir()
    fmp4 = cache / "123_LOSSLESS.fmp4"
    fmp4.write_bytes(b"partial")
    assert find_merged_dash_file(cache, "123", AudioQuality.LOSSLESS) is None

    flac = cache / "123_LOSSLESS.flac"
    flac.write_bytes(b"ok")
    assert find_merged_dash_file(cache, "123", AudioQuality.LOSSLESS) == flac


def test_find_merged_dash_file_hi_res_alias(tmp_path):
    from tidal_dl_ru.providers.tidal.models import AudioQuality
    from tidal_dl_ru.server.streaming import find_merged_dash_file

    hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    if hi is None:
        pytest.skip("HI_RES_LOSSLESS not in enum")

    cache = tmp_path / "cache"
    cache.mkdir()
    flac = cache / f"456_{hi.name}.flac"
    flac.write_bytes(b"ok")
    assert find_merged_dash_file(cache, "456", AudioQuality.LOSSLESS) == flac


def test_range_bytes_small_early_slice_expanded():
    assert range_bytes_needed(_req("bytes=0-65535")) >= _MIN_RANGE_RESPONSE


def test_cap_bts_range_limits_open_ended():
    capped = cap_bts_range("bytes=0-")
    assert capped == f"bytes=0-{_BTS_INITIAL_RANGE_BYTES - 1}"


def test_cap_bts_range_passes_suffix_probe():
    assert cap_bts_range("bytes=-128") == "bytes=-128"
