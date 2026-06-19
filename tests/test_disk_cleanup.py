"""Disk cleanup sweeper."""

import os
import time

from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.disk_cleanup import run_disk_cleanup
from tidal_dl_ru.server.settings import settings


def test_disk_cleanup_removes_old_job_dir(tmp_path, monkeypatch):
    jobs = tmp_path / "jobs"
    cache = tmp_path / "cache"
    jobs.mkdir()
    cache.mkdir()
    old_dir = jobs / "old-job"
    old_dir.mkdir()
    (old_dir / "track.flac").write_bytes(b"x" * 100)
    os.utime(old_dir, (time.time() - 90000, time.time() - 90000))

    monkeypatch.setattr(settings, "jobs_dir", jobs)
    monkeypatch.setattr(settings, "stream_cache_dir", cache)
    monkeypatch.setattr(settings, "job_ttl_seconds", 3600)
    monkeypatch.setattr(settings, "file_url_ttl_seconds", 3600)
    monkeypatch.setattr(settings, "stream_cache_max_bytes", 10**9)

    stats = run_disk_cleanup()
    assert stats["jobs_dirs_removed"] >= 1
    assert not old_dir.exists()


def test_disk_cleanup_prunes_stale_registry(tmp_path, monkeypatch):
    jobs = tmp_path / "jobs"
    jobs.mkdir()
    registry = jobs / "downloaded_tracks.json"
    registry.write_text(
        '{"gone": {"path": "missing/file.flac", "owner_id": 1, "quality": "LOSSLESS"}}',
        encoding="utf-8",
    )

    monkeypatch.setattr(settings, "jobs_dir", jobs)
    monkeypatch.setattr(settings, "stream_cache_dir", tmp_path / "cache")
    monkeypatch.setattr(settings, "job_ttl_seconds", 3600)
    monkeypatch.setattr(job_state, "_registry_path", registry)

    stale = jobs / "stale"
    stale.mkdir()
    os.utime(stale, (time.time() - 90000, time.time() - 90000))

    run_disk_cleanup()
    data = registry.read_text(encoding="utf-8")
    assert "gone" not in data
