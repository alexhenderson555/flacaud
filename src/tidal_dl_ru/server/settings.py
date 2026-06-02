from __future__ import annotations

import os
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.lower() in ("1", "true", "yes", "on")


class Settings:
    """Runtime configuration via environment variables.

    For local dev, defaults work without any env. In production, set:
    - TIDALDLRU_POOL_KEY (required for shared pool across containers)
    - TIDALDLRU_SIGNING_SECRET (required for file URL signing)
    - REDIS_URL
    - TIDALDLRU_JOBS_DIR
    """

    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    jobs_dir: Path = Path(
        os.environ.get(
            "TIDALDLRU_JOBS_DIR",
            str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "jobs"),
        )
    )
    signing_secret: str = os.environ.get(
        "TIDALDLRU_SIGNING_SECRET",
        "DEV-INSECURE-CHANGE-ME-IN-PRODUCTION-9f8e7d6c5b4a",
    )
    file_url_ttl_seconds: int = int(os.environ.get("TIDALDLRU_FILE_TTL", "86400"))
    job_ttl_seconds: int = int(os.environ.get("TIDALDLRU_JOB_TTL", "86400"))
    fetch_lyrics: bool = _bool("TIDALDLRU_LYRICS", True)
    # Max parallel ARQ workers per process — affects pool concurrency.
    arq_max_jobs: int = int(os.environ.get("TIDALDLRU_ARQ_MAX_JOBS", "4"))


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
