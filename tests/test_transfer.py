"""API tests for Tidal library transfer (/api/transfer)."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, select

from tests.conftest import register_and_login
from tidal_dl_ru.core.models import Track
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.catalog_providers import YouTubeMusicProvider
from tidal_dl_ru.providers.match_types import MatchDetail
from tidal_dl_ru.server import transfer_tasks
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.transfer_service import (
    TransferResolveResult,
    create_playlist_from_tracks,
    import_tracks_to_library,
    preview_dict_from_result,
    resolve_transfer,
    track_to_saved_base,
    tracks_for_import_from_resolve,
)

TIDAL_URL = "https://tidal.com/browse/playlist/abc123"

SAMPLE_TRACKS = [
    Track(
        provider="tidal",
        provider_id="101",
        title="Track One",
        artists=["Artist A"],
        album="Album X",
        duration_s=200,
        quality="LOSSLESS",
    ),
    Track(
        provider="tidal",
        provider_id="102",
        title="Track Two",
        artists=["Artist B"],
        album="Album X",
        duration_s=180,
        quality="HIGH",
    ),
]

MOCK_RESULT = TransferResolveResult(
    source_kind="playlist",
    source_title="My Playlist",
    source_platform="tidal",
    tracks=SAMPLE_TRACKS,
    source_total=2,
    unmatched_count=0,
)


@pytest.fixture(autouse=True)
def _fake_transfer_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(transfer_tasks, "_client", lambda: fake)


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_transfer.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    yield
    db_mod.engine = None


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    headers, _ = register_and_login(client, username="transferuser", email="transfer@test.local")
    return headers


def _complete_preview_task(task_id: str) -> None:
    transfer_tasks.mark_done(task_id, preview_dict_from_result(MOCK_RESULT))


class TestTransferService:
    def test_track_to_saved_base(self):
        base = track_to_saved_base(SAMPLE_TRACKS[0])
        assert base.provider == "tidal"
        assert base.provider_id == "101"
        assert json.loads(base.artists_json) == ["Artist A"]
        assert base.quality == "LOSSLESS"

    def test_tracks_for_import_from_resolve_uses_full_track(self):
        full = Track(
            provider="tidal",
            provider_id="101",
            title="Track One",
            artists=["Artist A"],
            artist_ids=["55"],
            album="Album X",
            duration_s=200,
            release_date="2014-06-01",
            quality="LOSSLESS",
        )
        result = TransferResolveResult(
            source_kind="playlist",
            source_title="P",
            source_platform="spotify",
            tracks=[full],
            source_total=1,
            unmatched_count=0,
        )
        preview = preview_dict_from_result(result)
        imported = tracks_for_import_from_resolve(result, preview, None)
        assert len(imported) == 1
        assert imported[0].release_date == "2014-06-01"
        assert imported[0].artist_ids == ["55"]

    def test_import_merges_metadata_into_existing_row(self, client, auth_headers):
        with next(get_session()) as session:
            user = session.exec(select(User).where(User.username == "transferuser")).first()
            assert user is not None

            slim = [
                Track(
                    provider="tidal",
                    provider_id="101",
                    title="Track One",
                    artists=["Artist A"],
                    album="Album X",
                    duration_s=200,
                    quality="LOSSLESS",
                )
            ]
            import_tracks_to_library(session, user, slim)

            rich = [
                Track(
                    provider="tidal",
                    provider_id="101",
                    title="Track One",
                    artists=["Artist A"],
                    artist_ids=["55"],
                    album="Album X",
                    duration_s=200,
                    release_date="2014-06-01",
                    quality="LOSSLESS",
                )
            ]
            added, already = import_tracks_to_library(session, user, rich)
            assert added == 0
            assert already == 1

            from tidal_dl_ru.database.models import SavedTrack

            row = session.exec(
                select(SavedTrack).where(
                    SavedTrack.user_id == user.id,
                    SavedTrack.provider_id == "101",
                )
            ).first()
            assert row is not None
            assert row.release_date == "2014-06-01"
            assert json.loads(row.artist_ids_json) == ["55"]

    def test_import_and_playlist_roundtrip(self, client, auth_headers):
        with next(get_session()) as session:
            user = session.exec(select(User).where(User.username == "transferuser")).first()
            assert user is not None

            added, already = import_tracks_to_library(session, user, SAMPLE_TRACKS)
            assert added == 2
            assert already == 0

            added2, already2 = import_tracks_to_library(session, user, SAMPLE_TRACKS)
            assert added2 == 0
            assert already2 == 2

            pl = create_playlist_from_tracks(session, user, "Test Import", SAMPLE_TRACKS)
            assert pl.id is not None
            tracks = pl.track_rows
            assert len(tracks) == 2
            assert tracks[0].provider_id == "101"

    def test_ytmusic_vibes_metadata_survives_transfer_resolve(self, monkeypatch):
        provider = YouTubeMusicProvider()
        source_url = "https://music.youtube.com/playlist?list=PL_VIBES"
        tidal_track = Track(
            provider="tidal",
            provider_id="770001",
            title="VIBES",
            artists=["BRY", "Stibens"],
            album="VIBES",
            duration_s=194,
            quality="LOSSLESS",
        )

        provider._ytm_client = lambda: type(
            "FakeYTMusic",
            (),
            {
                "get_playlist": lambda self, playlist_id, limit=None: {
                    "title": "VIBES source",
                    "tracks": [
                        {
                            "videoId": "yt-vibes-1",
                            "title": "VIBES",
                            "artists": [{"name": "BRY"}, {"name": "Stibens"}],
                            "duration_seconds": 194,
                        }
                    ],
                }
            },
        )()

        def _fake_match(raw, progress_cb=None, user_rules=None):
            assert len(raw) == 1
            assert raw[0].title == "VIBES"
            assert raw[0].artists == ["BRY", "Stibens"]
            details = [
                MatchDetail(
                    position=0,
                    matched=True,
                    method="search",
                    score=0.97,
                    source_title=raw[0].title,
                    source_artists=raw[0].artists,
                    tidal_title=tidal_track.title,
                    tidal_artists=tidal_track.artists,
                    tidal_provider_id=str(tidal_track.provider_id),
                )
            ]
            return [tidal_track], 0, details

        monkeypatch.setattr("tidal_dl_ru.server.transfer_service.find_transfer_provider", lambda _url: provider)
        monkeypatch.setattr("tidal_dl_ru.server.transfer_service.match_tracks_to_tidal", _fake_match)

        resolved = asyncio.run(resolve_transfer(source_url))
        preview = preview_dict_from_result(resolved)

        assert resolved.source_platform == "ytmusic"
        assert resolved.source_tracks is not None
        assert resolved.source_tracks[0].title == "VIBES"
        assert resolved.source_tracks[0].artists == ["BRY", "Stibens"]
        assert preview["tracks"][0]["title"] == "VIBES"
        assert preview["tracks"][0]["source_artists"] == ["BRY", "Stibens"]
        assert preview["unmatched_count"] == 0

    def test_recover_unmatched_from_saved_library(self, client, auth_headers, monkeypatch):
        with next(get_session()) as session:
            user = session.exec(select(User).where(User.username == "transferuser")).first()
            assert user is not None
            # This is the exact Tidal library track user already has.
            import_tracks_to_library(
                session,
                user,
                [
                    Track(
                        provider="tidal",
                        provider_id="say-what-182",
                        title="Say What",
                        artists=["Rampa", "Adam Port", "&ME", "Chuala", "Keinemusik"],
                        album="Say What",
                        duration_s=182,
                    )
                ],
            )

        source_url = "https://music.youtube.com/playlist?list=PL_SAYWHAT"
        src_match = Track(
            provider="ytmusic",
            provider_id="src1",
            title="VIBES",
            artists=["BRY", "Stibens"],
            duration_s=194,
        )
        src_unmatched = Track(
            provider="ytmusic",
            provider_id="src2",
            title="Say What",
            artists=["Rampa", "Adam Port", "&ME", "Chuala", "Keinemusik"],
            duration_s=182,
        )
        tidal_match = Track(
            provider="tidal",
            provider_id="770001",
            title="VIBES",
            artists=["BRY", "Stibens"],
            duration_s=194,
        )

        class _StubProvider:
            name = "ytmusic"

            def extract_raw_tracks(self, _url):
                return [src_match, src_unmatched], "Music", "playlist", 0

        def _fake_match(_raw, progress_cb=None, user_rules=None):
            details = [
                MatchDetail(
                    position=0,
                    matched=True,
                    method="search",
                    score=0.96,
                    source_title=src_match.title,
                    source_artists=src_match.artists,
                    tidal_title=tidal_match.title,
                    tidal_artists=tidal_match.artists,
                    tidal_provider_id=str(tidal_match.provider_id),
                ),
                MatchDetail(
                    position=1,
                    matched=False,
                    method="search",
                    score=0.41,
                    source_title=src_unmatched.title,
                    source_artists=src_unmatched.artists,
                ),
            ]
            return [tidal_match], 1, details

        monkeypatch.setattr("tidal_dl_ru.server.transfer_service.find_transfer_provider", lambda _url: _StubProvider())
        monkeypatch.setattr("tidal_dl_ru.server.transfer_service.match_tracks_to_tidal", _fake_match)

        with next(get_session()) as session:
            user = session.exec(select(User).where(User.username == "transferuser")).first()
            assert user is not None
            resolved = asyncio.run(resolve_transfer(source_url, user_id=user.id))

        preview = preview_dict_from_result(resolved)
        assert resolved.unmatched_count == 0
        assert any((t.get("provider_id") == "say-what-182") for t in preview["tracks"])
        say_what_row = next(t for t in preview["tracks"] if t.get("source_title") == "Say What")
        assert say_what_row["match_method"] == "saved_library"


class TestTransferApi:
    @patch("tidal_dl_ru.server.routers.transfer.asyncio.create_task")
    def test_preview(self, mock_create_task, client):
        mock_create_task.side_effect = lambda coro: None
        r = client.post("/api/transfer/preview", json={"url": TIDAL_URL})
        assert r.status_code == 200
        task_id = r.json()["task_id"]
        _complete_preview_task(task_id)
        r2 = client.get(f"/api/transfer/tasks/{task_id}")
        assert r2.status_code == 200
        body = r2.json()
        assert body["status"] == "done"
        preview = body["preview"]
        assert preview["source_kind"] == "playlist"
        assert preview["source_title"] == "My Playlist"
        assert preview["source_platform"] == "tidal"
        assert preview["total"] == 2
        assert preview["tracks"][0]["title"] == "Track One"

    @patch(
        "tidal_dl_ru.server.routers.transfer.resolve_transfer",
        new_callable=AsyncMock,
        return_value=MOCK_RESULT,
    )
    def test_import_requires_auth(self, _mock, client):
        r = client.post("/api/transfer/import", json={"url": TIDAL_URL})
        assert r.status_code == 401

    @patch("tidal_dl_ru.server.routers.transfer.asyncio.create_task")
    def test_import_with_task_id(self, mock_create_task, client, auth_headers):
        mock_create_task.side_effect = lambda coro: None
        start = client.post("/api/transfer/preview", json={"url": TIDAL_URL})
        task_id = start.json()["task_id"]
        _complete_preview_task(task_id)
        r = client.post(
            "/api/transfer/import",
            json={
                "task_id": task_id,
                "add_to_library": True,
                "create_playlist": True,
                "playlist_name": "Imported",
                "download_flac": False,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["added_to_library"] == 2
        assert body["playlist_name"] == "Imported"

    @patch("tidal_dl_ru.server.routers.transfer.asyncio.create_task")
    def test_import_idempotent_by_task_id(self, mock_create_task, client, auth_headers):
        mock_create_task.side_effect = lambda coro: None
        start = client.post("/api/transfer/preview", json={"url": TIDAL_URL})
        task_id = start.json()["task_id"]
        _complete_preview_task(task_id)
        payload = {
            "task_id": task_id,
            "add_to_library": True,
            "create_playlist": False,
            "download_flac": False,
        }
        first = client.post("/api/transfer/import", json=payload, headers=auth_headers)
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert first_body["added_to_library"] == 2
        assert first_body["already_in_library"] == 0

        second = client.post("/api/transfer/import", json=payload, headers=auth_headers)
        assert second.status_code == 200, second.text
        second_body = second.json()
        assert second_body["added_to_library"] == 2
        assert second_body["already_in_library"] == 0

        lib = client.get("/api/library", headers=auth_headers)
        assert len(lib.json()) == 2

    @patch(
        "tidal_dl_ru.server.routers.transfer.resolve_transfer",
        new_callable=AsyncMock,
        return_value=MOCK_RESULT,
    )
    def test_import_library_and_playlist(self, _mock, client, auth_headers):
        r = client.post(
            "/api/transfer/import",
            json={
                "url": TIDAL_URL,
                "add_to_library": True,
                "create_playlist": True,
                "playlist_name": "Imported",
                "download_flac": False,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["added_to_library"] == 2
        assert body["already_in_library"] == 0
        assert body["playlist_id"] is not None
        assert body["playlist_name"] == "Imported"
        assert body["download_job_id"] is None

        lib = client.get("/api/library", headers=auth_headers)
        assert len(lib.json()) == 2

        pl = client.get("/api/playlists", headers=auth_headers)
        assert any(p["name"] == "Imported" for p in pl.json())

    @patch(
        "tidal_dl_ru.server.routers.transfer.resolve_transfer",
        new_callable=AsyncMock,
        return_value=MOCK_RESULT,
    )
    def test_import_skips_duplicates(self, _mock, client, auth_headers):
        client.post("/api/transfer/import", json={"url": TIDAL_URL}, headers=auth_headers)
        r = client.post(
            "/api/transfer/import",
            json={"url": TIDAL_URL, "create_playlist": False},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["added_to_library"] == 0
        assert body["already_in_library"] == 2
