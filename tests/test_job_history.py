import json

import fakeredis

from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.schemas import JobStatus, TrackProgress


def test_list_jobs_for_owner(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(job_state, "_client", lambda: fake)

    mine = JobStatus(
        job_id="aaa111",
        owner_id=7,
        job_type="download",
        status="done",
        quality="LOSSLESS",
        created_at=100.0,
        updated_at=200.0,
        total_tracks=1,
        done_tracks=1,
        tracks=[TrackProgress(title="Track A", status="done")],
    )
    other = JobStatus(
        job_id="bbb222",
        owner_id=99,
        job_type="download",
        status="done",
        created_at=50.0,
        updated_at=60.0,
    )
    job_state.save(mine)
    job_state.save(other)

    rows = job_state.list_jobs_for_owner(7, limit=10)
    assert len(rows) == 1
    assert rows[0].job_id == "aaa111"


def test_mark_done_analyze_set_with_zero_total_tracks(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(job_state, "_client", lambda: fake)

    job_id = "set000"
    job_state.create(job_id, provider="youtube", job_type="analyze_set", owner_id=1)
    job_state.mark_done(job_id)

    status = job_state.load(job_id)
    assert status is not None
    assert status.status == "done"


def test_update_set_tracks_advances_stale_process_phase(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(job_state, "_client", lambda: fake)

    job_id = "set111"
    job_state.create(job_id, job_type="analyze_set", owner_id=1)
    job_state.update_analysis(
        job_id,
        phase="process",
        percent=16,
        label="Processing audio…",
    )
    job_state.update_set_tracks(job_id, [{
        "artist": "Lipps, Inc.",
        "title": "Funkytown",
        "timestamp": "2:30",
        "matched_track": None,
    }])

    status = job_state.load(job_id)
    assert status is not None
    assert status.analysis is not None
    assert status.analysis.phase == "scan"
    assert status.analysis.tracks_found == 1
    assert len(status.set_tracks) == 1


def test_registry_rel_path_dict():
    assert job_state.registry_rel_path({"path": "job1/foo.flac"}) == "job1/foo.flac"
    assert job_state.registry_rel_path("legacy/path.flac") == "legacy/path.flac"
