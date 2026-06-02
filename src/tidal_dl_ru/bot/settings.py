from __future__ import annotations

import os


class BotSettings:
    """Bot configuration via environment variables."""

    token: str = os.environ.get("TIDALDLRU_BOT_TOKEN", "")
    api_base: str = os.environ.get("TIDALDLRU_API_BASE", "http://localhost:8000")

    # Polling interval when waiting for a job to finish (seconds).
    job_poll_interval: float = float(os.environ.get("TIDALDLRU_JOB_POLL", "3"))
    job_timeout: float = float(os.environ.get("TIDALDLRU_JOB_TIMEOUT", "600"))

    # Max file size Telegram allows (50 MB for bots).
    tg_max_file_size: int = 50 * 1024 * 1024


bot_settings = BotSettings()
