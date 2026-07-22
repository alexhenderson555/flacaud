"""Tests for server.files -- signed download token verification."""

from __future__ import annotations

from tidal_dl_ru.server import files as files_mod
from tidal_dl_ru.server.settings import settings


def test_valid_token_round_trips_to_real_file(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "jobs_dir", tmp_path)
    job_dir = tmp_path / "job1"
    job_dir.mkdir()
    (job_dir / "track.flac").write_bytes(b"data")

    token = files_mod.sign_file("job1", "track.flac")
    resolved = files_mod.verify_file(token)

    assert resolved == (job_dir / "track.flac").resolve()


def test_missing_file_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "jobs_dir", tmp_path)
    token = files_mod.sign_file("job1", "nope.flac")
    assert files_mod.verify_file(token) is None


def test_tampered_token_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "jobs_dir", tmp_path)
    token = files_mod.sign_file("job1", "track.flac")
    assert files_mod.verify_file(token + "x") is None


def test_sibling_directory_not_treated_as_inside_jobs_dir(tmp_path, monkeypatch):
    """A jobs_dir like '.../jobs' must not accept '.../jobs_backup/...' just
    because the string 'jobs_backup' starts with 'jobs' -- this is the sibling-
    directory bypass a naive str.startswith() containment check would miss."""
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    sibling_dir = tmp_path / "jobs_backup"
    sibling_dir.mkdir()
    (sibling_dir / "secret.flac").write_bytes(b"secret")

    monkeypatch.setattr(settings, "jobs_dir", jobs_dir)
    # Craft a token whose job_id climbs out of jobs_dir into the sibling directory.
    token = files_mod.sign_file("../jobs_backup", "secret.flac")

    assert files_mod.verify_file(token) is None
