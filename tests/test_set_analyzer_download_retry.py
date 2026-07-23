"""Tests for set_analyzer's yt-dlp rate-limit retry helper."""

from __future__ import annotations

import pytest

from tidal_dl_ru.core import set_analyzer


def test_is_rate_limited_detects_429():
    assert set_analyzer._is_rate_limited(Exception("HTTP Error 429: Too Many Requests"))
    assert set_analyzer._is_rate_limited(Exception("... 429 ..."))
    assert not set_analyzer._is_rate_limited(Exception("HTTP Error 404: Not Found"))


def test_friendly_download_error_for_rate_limit_vs_generic():
    rate_limited = set_analyzer._friendly_download_error(Exception("HTTP Error 429: Too Many Requests"))
    assert "rate-limiting" in rate_limited
    assert "429" not in rate_limited  # no raw traceback text leaking to the user

    generic = set_analyzer._friendly_download_error(Exception("some other yt-dlp failure"))
    assert "some other yt-dlp failure" in generic


class TestRunYtDlpDownload:
    @pytest.fixture(autouse=True)
    def _no_real_sleep(self, monkeypatch):
        async def fake_sleep(_seconds):
            return None
        monkeypatch.setattr(set_analyzer.asyncio, "sleep", fake_sleep)

    @pytest.fixture(autouse=True)
    def _not_cancelled(self, monkeypatch):
        monkeypatch.setattr(set_analyzer.job_state, "is_cancelled", lambda job_id: False)

    @pytest.mark.asyncio
    async def test_succeeds_first_try(self):
        calls = []

        def download_fn():
            calls.append(1)

        err = await set_analyzer._run_yt_dlp_download("job1", download_fn)
        assert err is None
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_retries_on_rate_limit_then_succeeds(self):
        calls = []

        def download_fn():
            calls.append(1)
            if len(calls) < 2:
                raise Exception("HTTP Error 429: Too Many Requests")

        err = await set_analyzer._run_yt_dlp_download("job1", download_fn)
        assert err is None
        assert len(calls) == 2

    @pytest.mark.asyncio
    async def test_gives_up_after_max_retries_on_persistent_rate_limit(self):
        calls = []

        def download_fn():
            calls.append(1)
            raise Exception("HTTP Error 429: Too Many Requests")

        err = await set_analyzer._run_yt_dlp_download("job1", download_fn)
        assert err is not None
        assert set_analyzer._is_rate_limited(err)
        assert len(calls) == set_analyzer._RATE_LIMIT_RETRIES + 1

    @pytest.mark.asyncio
    async def test_does_not_retry_non_rate_limit_error(self):
        calls = []

        def download_fn():
            calls.append(1)
            raise Exception("some unrelated failure")

        err = await set_analyzer._run_yt_dlp_download("job1", download_fn)
        assert err is not None
        assert str(err) == "some unrelated failure"
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_returns_cancelled_if_job_cancelled_before_start(self, monkeypatch):
        monkeypatch.setattr(set_analyzer.job_state, "is_cancelled", lambda job_id: True)
        calls = []

        def download_fn():
            calls.append(1)

        err = await set_analyzer._run_yt_dlp_download("job1", download_fn)
        assert err is not None
        assert not calls
