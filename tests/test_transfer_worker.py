"""ARQ transfer preview task tests (fakeredis)."""

import asyncio
from unittest.mock import patch

import fakeredis
import pytest

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.match_types import MatchDetail
from tidal_dl_ru.server import transfer_tasks
from tidal_dl_ru.server.transfer_service import TransferResolveResult, preview_dict_from_result


@pytest.fixture(autouse=True)
def _fake_transfer_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(transfer_tasks, "_client", lambda: fake)


def test_run_preview_task_stores_match_metadata():
    task_id, _access = transfer_tasks.create_task("https://open.spotify.com/playlist/x", user_id=42)
    sample = TransferResolveResult(
        source_kind="playlist",
        source_title="Demo",
        source_platform="spotify",
        tracks=[
            Track(provider="tidal", provider_id="1", title="A", artists=["X"], duration_s=200),
        ],
        source_total=2,
        unmatched_count=1,
        match_details=[
            MatchDetail(
                position=0,
                matched=True,
                method="search",
                score=0.88,
                source_title="A",
                source_artists=["X"],
                tidal_title="A",
                tidal_artists=["X"],
                tidal_provider_id="1",
            ),
            MatchDetail(
                position=1,
                matched=False,
                method="search",
                score=0.4,
                source_title="B",
                source_artists=["Y"],
            ),
        ],
    )

    with patch("tidal_dl_ru.server.transfer_service._resolve_transfer_sync", return_value=sample):
        asyncio.run(transfer_tasks.run_preview_task(task_id))

    task = transfer_tasks.load_task(task_id)
    assert task is not None
    assert task.status == "done"
    assert task.preview["tracks"][0]["match_method"] == "search"
    assert task.preview["tracks"][0]["match_score"] == 0.88
    assert len(task.preview["unmatched_entries"]) == 1


def test_preview_dict_includes_unmatched_entries():
    result = TransferResolveResult(
        source_kind="playlist",
        source_title="Demo",
        source_platform="spotify",
        tracks=[Track(provider="tidal", provider_id="1", title="A", artists=["X"])],
        source_total=2,
        unmatched_count=1,
        match_details=[
            MatchDetail(
                position=0,
                matched=True,
                method="isrc",
                score=1.0,
                source_title="A",
                source_artists=["X"],
                tidal_title="A",
                tidal_artists=["X"],
                tidal_provider_id="1",
            ),
            MatchDetail(
                position=1,
                matched=False,
                method="search",
                score=0.35,
                source_title="B",
                source_artists=["Y"],
            ),
        ],
    )
    data = preview_dict_from_result(result)
    assert data["tracks"][0]["match_method"] == "isrc"
    assert data["unmatched_entries"][0]["source_title"] == "B"
