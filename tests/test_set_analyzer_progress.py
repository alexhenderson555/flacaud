"""Tests for analyze_set structured progress in Redis job state."""

from unittest.mock import patch

from tidal_dl_ru.server import jobs as job_state


class TestSetAnalyzerProgress:
    def test_update_analysis_persists_structured_fields(self, monkeypatch):
        stored: dict[str, str] = {}

        class FakeRedis:
            def set(self, key, value, ex=None):
                stored[key] = value

            def get(self, key):
                return stored.get(key)

            def ping(self):
                return True

        monkeypatch.setattr(job_state, "_client", lambda: FakeRedis())

        job_id = job_state.new_job_id()
        job_state.create(job_id, provider="youtube", job_type="analyze_set", owner_id=1)

        job_state.update_analysis(
            job_id,
            phase="scan",
            percent=42,
            label="Analyzing… 42%",
            segments_done=7,
            segments_total=120,
            tracks_found=3,
        )

        loaded = job_state.load(job_id)
        assert loaded is not None
        assert loaded.analysis is not None
        assert loaded.analysis.phase == "scan"
        assert loaded.analysis.percent == 42
        assert loaded.analysis.segments_done == 7
        assert loaded.analysis.segments_total == 120
        assert loaded.analysis.tracks_found == 3
        assert loaded.analysis.label == "Analyzing… 42%"
        assert loaded.tracks[0].title == "Analyzing… 42%"

    def test_download_hook_updates_phase(self, monkeypatch):
        stored: dict[str, str] = {}

        class FakeRedis:
            def set(self, key, value, ex=None):
                stored[key] = value

            def get(self, key):
                return stored.get(key)

            def ping(self):
                return True

        monkeypatch.setattr(job_state, "_client", lambda: FakeRedis())

        from tidal_dl_ru.core.set_analyzer import _download_progress_hook

        job_id = job_state.new_job_id()
        job_state.create(job_id, provider="youtube", job_type="analyze_set", owner_id=1)

        hook = _download_progress_hook(job_id)
        hook({"status": "downloading", "total_bytes": 1000, "downloaded_bytes": 500})

        loaded = job_state.load(job_id)
        assert loaded.analysis.phase == "download"
        assert loaded.analysis.percent == 50

        hook({"status": "finished"})
        loaded = job_state.load(job_id)
        assert loaded.analysis.phase == "process"
        assert loaded.analysis.percent == 15

    def test_mark_cancelled(self, monkeypatch):
        stored: dict[str, str] = {}

        class FakeRedis:
            def set(self, key, value, ex=None):
                stored[key] = value

            def get(self, key):
                return stored.get(key)

            def ping(self):
                return True

        monkeypatch.setattr(job_state, "_client", lambda: FakeRedis())

        job_id = job_state.new_job_id()
        job_state.create(job_id, provider="youtube", job_type="analyze_set", owner_id=1)
        job_state.update_analysis(job_id, phase="scan", percent=10, label="Analyzing…")

        assert job_state.mark_cancelled(job_id) is True
        loaded = job_state.load(job_id)
        assert loaded.status == "cancelled"
        assert job_state.is_cancelled(job_id) is True
