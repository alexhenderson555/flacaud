"""Download registry API — auth and per-owner scoping."""

import json

from fastapi.testclient import TestClient

from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.app import app


def test_downloads_requires_auth():
    with TestClient(app) as client:
        res = client.get("/api/downloads")
        assert res.status_code == 401


def test_get_downloaded_registry_for_owner_filters(tmp_path, monkeypatch):
    monkeypatch.setattr(job_state, "_registry_path", tmp_path / "downloaded_tracks.json")
    tmp_path.mkdir(parents=True, exist_ok=True)

    job_state.mark_downloaded("track-a", "a.flac", owner_id=10)
    job_state.mark_downloaded("track-b", "b.flac", owner_id=20)
    job_state.mark_downloaded("legacy", "old.flac")

    scoped_a = job_state.get_downloaded_registry_for_owner(10)
    scoped_b = job_state.get_downloaded_registry_for_owner(20)

    assert list(scoped_a.keys()) == ["track-a"]
    assert list(scoped_b.keys()) == ["track-b"]


def test_legacy_registry_entries_hidden_from_api(tmp_path, monkeypatch):
    monkeypatch.setattr(job_state, "_registry_path", tmp_path / "downloaded_tracks.json")
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "downloaded_tracks.json").write_text(
        json.dumps({"legacy": {"path": "old.flac", "quality": "LOSSLESS"}}),
        encoding="utf-8",
    )

    assert job_state.get_downloaded_registry_for_owner(1) == {}
