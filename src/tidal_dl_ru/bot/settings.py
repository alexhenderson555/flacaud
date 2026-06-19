from __future__ import annotations

import os


def _default_public_api_base() -> str:
    """Public URL for user-facing download links (ZIP); not the internal Docker hostname."""
    return os.environ.get("TIDALDLRU_PUBLIC_API_BASE", "https://flacaud.ru").rstrip("/")


class BotSettings:
    """Bot configuration via environment variables."""

    token: str = os.environ.get("TIDALDLRU_BOT_TOKEN", "")
    api_base: str = os.environ.get("TIDALDLRU_API_BASE", "http://localhost:8000")
    public_api_base: str = _default_public_api_base()

    # Polling interval when waiting for a job to finish (seconds).
    job_poll_interval: float = float(os.environ.get("TIDALDLRU_JOB_POLL", "3"))
    job_timeout: float = float(os.environ.get("TIDALDLRU_JOB_TIMEOUT", "600"))

    # Max file size Telegram allows (50 MB for bots).
    tg_max_file_size: int = 50 * 1024 * 1024


bot_settings = BotSettings()
