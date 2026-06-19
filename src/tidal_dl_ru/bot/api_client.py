"""Async HTTP client for the FlacAud FastAPI backend."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import Optional

import httpx

from tidal_dl_ru.bot.settings import bot_settings
from tidal_dl_ru.database.auth import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token
from tidal_dl_ru.server.schemas import JobStatus


class APIClient:
    """Thin async wrapper around the REST API."""

    def __init__(self) -> None:
        self._base = bot_settings.api_base.rstrip("/")
        self._http = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        await self._http.aclose()

    def _auth_headers(self, user_id: Optional[int]) -> dict:
        """Mint a short-lived bearer token for ``user_id``.

        The job endpoints require auth. A Telegram user may have no @username to
        key on, so we sign a uid-claim token. ``src=bot`` tells /api/jobs the bot
        already metered this download, so the route skips its own web-quota
        reservation (avoids double-counting against the shared daily limit).
        """
        if user_id is None:
            return {}
        token = create_access_token(
            {"uid": user_id, "src": "bot"},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {"Authorization": f"Bearer {token}"}

    async def create_job(
        self,
        url: str,
        quality: str = "LOSSLESS",
        lyrics: bool = False,
        karaoke: bool = False,
        dj_analyze: bool = False,
        match_tidal: bool = False,
        split: bool = False,
        job_type: str = "download",
        user_id: Optional[int] = None,
    ) -> JobStatus:
        resp = await self._http.post(
            f"{self._base}/api/jobs",
            json={
                "url": url,
                "job_type": job_type,
                "quality": quality,
                "lyrics": lyrics,
                "karaoke": karaoke,
                "dj_analyze": dj_analyze,
                "match_tidal": match_tidal,
                "split": split,
            },
            headers=self._auth_headers(user_id),
        )
        resp.raise_for_status()
        return JobStatus.model_validate(resp.json())

    async def job_status(self, job_id: str, user_id: Optional[int] = None) -> Optional[JobStatus]:
        resp = await self._http.get(
            f"{self._base}/api/jobs/{job_id}",
            headers=self._auth_headers(user_id),
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return JobStatus.model_validate(resp.json())

    async def wait_for_job(
        self,
        job_id: str,
        poll_interval: float = 0,
        timeout: float = 0,
        user_id: Optional[int] = None,
    ) -> JobStatus:
        """Poll until job is done/failed or timeout."""
        interval = poll_interval or bot_settings.job_poll_interval
        deadline = asyncio.get_event_loop().time() + (timeout or bot_settings.job_timeout)

        while asyncio.get_event_loop().time() < deadline:
            status = await self.job_status(job_id, user_id=user_id)
            if status and status.status in ("done", "failed"):
                return status
            await asyncio.sleep(interval)

        # Timeout — return last known status
        status = await self.job_status(job_id, user_id=user_id)
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
