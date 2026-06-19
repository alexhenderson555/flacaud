from pathlib import Path

from tidal_dl_ru.server import jobs as job_state


def test_registry_file_for_quality_matches_tier(tmp_path, monkeypatch):
    monkeypatch.setattr(job_state.settings, "jobs_dir", tmp_path)
    flac = tmp_path / "job1/track.flac"
    flac.parent.mkdir(parents=True)
    flac.write_bytes(b"f")

    registry = {
        "123": {
            "path": "job1/track.flac",
            "quality": "LOSSLESS",
        }
    }

    assert job_state.registry_file_for_quality(registry, "123", "LOSSLESS") == flac
    assert job_state.registry_file_for_quality(registry, "123", "HIGH") is None
    assert job_state.registry_file_for_quality(registry, "123", "HI_RES") is None


def test_registry_file_for_quality_legacy_string_ignored(tmp_path, monkeypatch):
    monkeypatch.setattr(job_state.settings, "jobs_dir", tmp_path)
    flac = tmp_path / "job1/track.flac"
    flac.parent.mkdir(parents=True)
    flac.write_bytes(b"f")

    registry = {"123": "job1/track.flac"}
    assert job_state.registry_file_for_quality(registry, "123", "LOSSLESS") is None
