"""Tests for transfer_tasks progress and lifecycle functions."""

import fakeredis
import pytest

from tidal_dl_ru.server import transfer_tasks


@pytest.fixture(autouse=True)
def _fake_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(transfer_tasks, "_client", lambda: fake)


class TestPercent:
    def test_done(self):
        assert transfer_tasks._percent("done", 10, 10) == 100

    def test_failed(self):
        assert transfer_tasks._percent("failed", 0, 10) == 0

    def test_queued(self):
        assert transfer_tasks._percent("queued", 0, 0) == 5

    def test_reading_no_total(self):
        assert transfer_tasks._percent("reading", 0, 0) == 8

    def test_reading_with_total(self):
        result = transfer_tasks._percent("reading", 5, 10)
        assert 8 <= result <= 14

    def test_matching(self):
        result = transfer_tasks._percent("matching", 5, 10)
        assert 15 <= result <= 99

    def test_matching_half(self):
        result = transfer_tasks._percent("matching", 50, 100)
        assert result == 57  # 15 + int(0.5 * 84) = 15 + 42 = 57


class TestCreateTask:
    def test_basic(self):
        task_id, token = transfer_tasks.create_task("https://open.spotify.com/playlist/x")
        assert len(task_id) == 16
        assert len(token) > 10

    def test_with_user_id(self):
        task_id, token = transfer_tasks.create_task("https://example.test/set", user_id=42)
        task = transfer_tasks.load_task(task_id)
        assert task is not None
        assert task.user_id == 42


class TestLoadTask:
    def test_nonexistent(self):
        assert transfer_tasks.load_task("nonexistent") is None

    def test_roundtrip(self):
        task_id, _ = transfer_tasks.create_task("https://example.test/x")
        task = transfer_tasks.load_task(task_id)
        assert task is not None
        assert task.url == "https://example.test/x"
        assert task.status == "running"


class TestUpdateProgress:
    def test_basic(self):
        task_id, _ = transfer_tasks.create_task("https://example.test/x")
        transfer_tasks.update_progress(task_id, phase="matching", done=5, total=10, matched=3, label="Matching…")
        task = transfer_tasks.load_task(task_id)
        assert task.progress.phase == "matching"
        assert task.progress.done == 5
        assert task.progress.matched == 3

    def test_nonexistent_task_noop(self):
        transfer_tasks.update_progress("nonexistent", phase="done", label="Done")

    def test_done_task_not_updated(self):
        task_id, _ = transfer_tasks.create_task("https://example.test/x")
        transfer_tasks.mark_done(task_id, {"total": 5, "source_total": 10})
        transfer_tasks.update_progress(task_id, phase="matching", done=1, total=10, label="Retry")
        task = transfer_tasks.load_task(task_id)
        assert task.status == "done"
        assert task.progress.phase == "done"


class TestMarkDone:
    def test_basic(self):
        task_id, _ = transfer_tasks.create_task("https://example.test/x")
        transfer_tasks.mark_done(task_id, {"total": 5, "source_total": 10})
        task = transfer_tasks.load_task(task_id)
        assert task.status == "done"
        assert task.progress.percent == 100
        assert task.preview == {"total": 5, "source_total": 10}

    def test_nonexistent_noop(self):
        transfer_tasks.mark_done("nonexistent", {"total": 0})


class TestMarkFailed:
    def test_basic(self):
        task_id, _ = transfer_tasks.create_task("https://example.test/x")
        transfer_tasks.mark_failed(task_id, "Something went wrong")
        task = transfer_tasks.load_task(task_id)
        assert task.status == "failed"
        assert task.error == "Something went wrong"
        assert task.progress.phase == "failed"
        assert task.progress.percent == 0

    def test_nonexistent_noop(self):
        transfer_tasks.mark_failed("nonexistent", "error")
