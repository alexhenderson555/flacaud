from pathlib import Path

from tidal_dl_ru.server import jobs as job_state


def test_infer_delivered_ui_quality_m4a_is_high(tmp_path):
    path = tmp_path / "track.m4a"
    path.write_bytes(b"x")
    assert job_state.infer_delivered_ui_quality(path, "HI_RES") == "HIGH"


def test_infer_delivered_ui_quality_flac_keeps_tier(tmp_path):
    path = tmp_path / "track.flac"
    path.write_bytes(b"x")
    assert job_state.infer_delivered_ui_quality(path, "HI_RES") == "HI_RES"
    assert job_state.infer_delivered_ui_quality(path, "LOSSLESS") == "LOSSLESS"
