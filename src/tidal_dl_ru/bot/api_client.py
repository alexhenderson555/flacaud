"""Async HTTP client for the tidal-dl-ru FastAPI backend."""

from __future__ import annotations

import asyncio
from typing import Optional

import httpx

from tidal_dl_ru.bot.settings import bot_settings
from tidal_dl_ru.server.schemas import JobStatus, TrackProgress


class APIClient:
    """Thin async wrapper around the REST API."""

    def __init__(self) -> None:
        self._base = bot_settings.api_base.rstrip("/")
        self._http = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        await self._http.aclose()

    async def create_job(
        self,
        url: str,
        quality: str = "LOSSLESS",
        lyrics: bool = True,
        karaoke: bool = False,
        dj_analyze: bool = False,
        match_tidal: bool = False,
    ) -> JobStatus:
        resp = await self._http.post(
            f"{self._base}/api/jobs",
            json={
                "url": url,
                "quality": quality,
                "lyrics": lyrics,
                "karaoke": karaoke,
                "dj_analyze": dj_analyze,
                "match_tidal": match_tidal,
            },
        )
        resp.raise_for_status()
        return JobStatus.model_validate(resp.json())

    async def job_status(self, job_id: str) -> Optional[JobStatus]:
        resp = await self._http.get(f"{self._base}/api/jobs/{job_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return JobStatus.model_validate(resp.json())

    async def wait_for_job(
        self,
        job_id: str,
        poll_interval: float = 0,
        timeout: float = 0,
    ) -> JobStatus:
        """Poll until job is done/failed or timeout."""
        interval = poll_interval or bot_settings.job_poll_interval
        deadline = asyncio.get_event_loop().time() + (timeout or bot_settings.job_timeout)

        while asyncio.get_event_loop().time() < deadline:
            status = await self.job_status(job_id)
            if status and status.status in ("done", "failed"):
                return status
            await asyncio.sleep(interval)

        # Timeout — return last known status
        status = await self.job_status(job_id)
        if status is None:
            raise TimeoutError(f"Job {job_id} not found after timeout")
        return status

    def file_url(self, token: str) -> str:
        return f"{self._base}/api/files/{token}"

    async def download_file(self, token: str) -> tuple[bytes, str]:
        """Download a file by its signed token. Returns (content, filename)."""
        resp = await self._http.get(self.file_url(token), follow_redirects=True)
        resp.raise_for_status()
        # Extract filename from Content-Disposition or URL
        cd = resp.headers.get("content-disposition", "")
        filename = "track.flac"
        if "filename=" in cd:
            filename = cd.split("filename=")[-1].strip('"').strip("'")
        return resp.content, filename
