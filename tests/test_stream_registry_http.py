"""HTTP integration: stream registry must not serve another user's download."""

from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import register_and_login
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.settings import settings


def test_stream_does_not_use_other_users_registry_file(tmp_path, monkeypatch):
    """User B must not get FLAC bytes from user A's on-disk registry shortcut."""
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    track_id = "deadbeef"
    rel = f"{track_id}/owned.flac"
    flac_path = jobs_dir / rel
    flac_path.parent.mkdir(parents=True)
    payload = b"fLaC-owned-by-user-a"
    flac_path.write_bytes(payload)

    monkeypatch.setattr(settings, "jobs_dir", jobs_dir)
    monkeypatch.setattr(job_state, "_registry_path", tmp_path / "downloaded_tracks.json")

    with TestClient(app) as client:
        headers_a, _ = register_and_login(client, username="stream_owner_a")
        headers_b, _ = register_and_login(client, username="stream_owner_b")

        from sqlmodel import Session, select

        from tidal_dl_ru.database.database import engine
        from tidal_dl_ru.database.models import User

        with Session(engine) as session:
            owner = session.exec(select(User).where(User.username == "stream_owner_a")).one()
            owner_id = owner.id

        job_state.mark_downloaded(track_id, rel, owner_id=owner_id, quality="LOSSLESS")

        res_a = client.get(
            f"/api/stream/tidal/{track_id}?quality=LOSSLESS",
            headers=headers_a,
        )
        assert res_a.status_code == 200
        assert res_a.content == payload

        res_b = client.get(
            f"/api/stream/tidal/{track_id}?quality=LOSSLESS",
            headers=headers_b,
        )
        # User B must not get the on-disk registry shortcut (may fall through to Tidal → 503 in CI).
        assert res_b.content != payload
