from types import SimpleNamespace

from tidal_dl_ru.plan_limits import (
    cap_stream_quality,
    filter_qualities_for_player,
    lossless_flac_allowed,
    max_stream_quality_for_plan,
    visible_qualities_for_player,
)


def test_free_max_is_high():
    assert max_stream_quality_for_plan("free") == "HIGH"
    assert cap_stream_quality("LOSSLESS", "free") == "HIGH"
    assert cap_stream_quality("LOW", "free") == "HIGH"


def test_basic_max_is_lossless():
    assert max_stream_quality_for_plan("basic") == "LOSSLESS"
    assert cap_stream_quality("HI_RES", "basic") == "LOSSLESS"


def test_filter_low_from_player_list():
    assert filter_qualities_for_player(["LOW", "HIGH", "LOSSLESS"]) == ["HIGH", "LOSSLESS"]
    assert filter_qualities_for_player(["LOW"]) == ["HIGH"]


def test_visible_qualities_collapse_hires():
    assert visible_qualities_for_player(["HIGH", "HI_RES"]) == ["HIGH", "LOSSLESS"]


def test_basic_blocks_hires_flac():
    hires = SimpleNamespace(sample_rate=96000, bit_depth=24)
    cd = SimpleNamespace(sample_rate=48000, bit_depth=16)
    assert lossless_flac_allowed(hires, "basic") is False
    assert lossless_flac_allowed(cd, "basic") is True
    assert lossless_flac_allowed(hires, "pro") is True
