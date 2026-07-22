"""Tests for worker.py download_url task — provider stack mocked."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.server.worker import WorkerSettings, _download_sync, download_url


def _make_track(**kwargs) -> Track:
    defaults = dict(
        provider="tidal",
        provider_id="123",
        title="Test Song",
        artists=["Test Artist"],
        track_number=1,
    )
    defaults.update(kwargs)
    return Track(**defaults)


class TestDownloadSyncNoProvider:
    def test_no_provider_returns_none(self, tmp_path):
        track = _make_track(source_url="https://unknown.example/track")
        with (
            patch("tidal_dl_ru.server.worker.find_provider", return_value=None),
            patch("tidal_dl_ru.core.router.get_provider_by_name", return_value=None),
            patch("tidal_dl_ru.server.worker.job_state") as js,
        ):
            result = _download_sync("job1", 0, track, Quality.LOSSLESS, False, tmp_path)
        assert result is None
        js.update_track.assert_called_with(
            "job1", 0, status="failed", error="no provider matches track"
        )


class TestDownloadSyncProviderError:
    def test_provider_error_skips_track(self, tmp_path):
        track = _make_track(source_url="https://tidal.com/track/123")
        provider = MagicMock()
        provider.download.side_effect = ProviderError("Provider failed")
        with (
            patch("tidal_dl_ru.server.worker.find_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
        ):
            result = _download_sync("job1", 0, track, Quality.LOSSLESS, False, tmp_path)
        assert result is None


class TestDownloadUrlQuotaTopUp:
    """reserve_web_download only reserves 1 unit at job creation, regardless of
    how many tracks a URL expands to (playlist/album) -- download_url must top
    up the rest once the real count is known, but only when the job actually
    reserved quota (quota_reserved=True, i.e. not a bot-originated job)."""

    @pytest.mark.asyncio
    async def test_multi_track_job_tops_up_quota(self):
        tracks = [_make_track(provider_id=str(i)) for i in range(3)]
        provider = MagicMock()
        provider.expand = MagicMock(return_value=tracks)

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        job_status = MagicMock(owner_id=42)

        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
            patch("tidal_dl_ru.server.worker.asyncio.to_thread", side_effect=fake_to_thread),
            patch("tidal_dl_ru.server.worker._download_sync", return_value=Path("/tmp/f")),
            patch("tidal_dl_ru.bot.users.record_downloads_by_user_id") as record_mock,
        ):
            js.load.return_value = job_status
            result = await download_url(
                {}, "job1", "https://tidal.com/playlist/1", "LOSSLESS", False,
                quota_reserved=True,
            )

        assert result == {"ok": True, "count": 3}
        record_mock.assert_called_once_with(42, 3)

    @pytest.mark.asyncio
    async def test_bot_job_does_not_top_up_quota(self):
        """Bot-originated jobs (quota_reserved=False) already meter via the
        bot's own check_and_increment + record_downloads call — no top-up here."""
        tracks = [_make_track(provider_id=str(i)) for i in range(3)]
        provider = MagicMock()
        provider.expand = MagicMock(return_value=tracks)

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
            patch("tidal_dl_ru.server.worker.asyncio.to_thread", side_effect=fake_to_thread),
            patch("tidal_dl_ru.server.worker._download_sync", return_value=Path("/tmp/f")),
            patch("tidal_dl_ru.bot.users.record_downloads_by_user_id") as record_mock,
        ):
            js.load.return_value = MagicMock(owner_id=42)
            result = await download_url(
                {}, "job1", "https://tidal.com/playlist/1", "LOSSLESS", False,
                quota_reserved=False,
            )

        assert result == {"ok": True, "count": 3}
        record_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_single_track_job_skips_top_up(self):
        """A single-track job is fully covered by the 1-unit reservation already
        made at creation — no need to touch the DB again."""
        tracks = [_make_track()]
        provider = MagicMock()
        provider.expand = MagicMock(return_value=tracks)

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
            patch("tidal_dl_ru.server.worker.asyncio.to_thread", side_effect=fake_to_thread),
            patch("tidal_dl_ru.server.worker._download_sync", return_value=Path("/tmp/f")),
            patch("tidal_dl_ru.bot.users.record_downloads_by_user_id") as record_mock,
        ):
            js.load.return_value = MagicMock(owner_id=42)
            result = await download_url(
                {}, "job1", "https://tidal.com/track/1", "LOSSLESS", False,
                quota_reserved=True,
            )

        assert result == {"ok": True, "count": 1}
        record_mock.assert_not_called()


class TestWorkerSettings:
    def test_functions_registered(self):
        # Checked by name (not just count) so adding a task doesn't silently
        # need a magic-number bump here without anyone noticing what changed.
        names = {f.__name__ for f in WorkerSettings.functions}
        assert names == {
            "download_url",
            "analyze_set",
            "download_set_audio",
            "subscription_expiry_notify",
            "subscription_expire_due",
        }

    def test_cron_jobs_configured(self):
        assert len(WorkerSettings.cron_jobs) == 3

    def test_job_timeout(self):
        assert WorkerSettings.job_timeout == 3600

    def test_keep_result(self):
        assert WorkerSettings.keep_result == 86400


class TestDownloadUrlNoProvider:
    @pytest.mark.asyncio
    async def test_no_provider(self):
        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=None),
            patch("tidal_dl_ru.server.worker.job_state") as js,
        ):
            result = await download_url({}, "job1", "https://unknown.url", "LOSSLESS", False)
        assert result == {"ok": False, "error": "no provider"}
        js.mark_failed.assert_called_with("job1", "No provider matches this URL.")


class TestDownloadUrlEmptyTracks:
    @pytest.mark.asyncio
    async def test_empty_resolution(self):
        provider = MagicMock()
        provider.expand = MagicMock(return_value=[])

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
            patch("tidal_dl_ru.server.worker.asyncio.to_thread", side_effect=fake_to_thread),
        ):
            result = await download_url({}, "job1", "https://tidal.com/album/1", "LOSSLESS", False)
        assert result == {"ok": False, "error": "empty"}


class TestDownloadUrlMatchFailed:
    @pytest.mark.asyncio
    async def test_match_tidal_no_results(self):
        track = _make_track()
        provider = MagicMock()
        provider.expand = MagicMock(return_value=[track])

        tidal_p = MagicMock()
        tidal_p.search = MagicMock(return_value=[])

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        with (
            patch("tidal_dl_ru.core.transfer_router.find_transfer_provider", return_value=provider),
            patch("tidal_dl_ru.server.worker.job_state") as js,
            patch("tidal_dl_ru.server.worker.asyncio.to_thread", side_effect=fake_to_thread),
            patch("tidal_dl_ru.core.router.get_provider_by_name", return_value=tidal_p),
        ):
            result = await download_url(
                {}, "job1", "https://youtube.com/watch?v=abc", "LOSSLESS", False, match_tidal=True
            )
        assert result == {"ok": False, "error": "match_failed"}
