from __future__ import annotations

import os
import secrets
import tempfile
import warnings
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.lower() in ("1", "true", "yes", "on")


def _signing_secret() -> str:
    """File/media URL signing secret.

    Like the JWT secret, a per-process random fallback silently breaks signed
    URLs across restarts and across multiple api/worker processes (a token
    signed by one process won't verify in another), so we warn loudly when it
    isn't set rather than ship a hardcoded default.
    """
    secret = os.environ.get("TIDALDLRU_SIGNING_SECRET")
    if secret:
        return secret
    warnings.warn(
        "TIDALDLRU_SIGNING_SECRET is not set — using an ephemeral random key. "
        "Signed media/file URLs won't verify across restarts or multiple "
        "api/worker processes. Set TIDALDLRU_SIGNING_SECRET in production.",
        RuntimeWarning,
        stacklevel=2,
    )
    return secrets.token_urlsafe(48)


class Settings:
    """Runtime configuration via environment variables.

    For local dev, defaults work without any env. In production, set:
    - TIDALDLRU_POOL_KEY (required for shared pool across containers)
    - TIDALDLRU_SIGNING_SECRET (required for file URL signing)
    - REDIS_URL
    - TIDALDLRU_JOBS_DIR
    - TIDALDLRU_STREAM_CACHE_DIR
    """

    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    jobs_dir: Path = Path(
        os.environ.get(
            "TIDALDLRU_JOBS_DIR",
            str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "jobs"),
        )
    )
    stream_cache_dir: Path = Path(
        os.environ.get(
            "TIDALDLRU_STREAM_CACHE_DIR",
            str(Path(tempfile.gettempdir()) / "tidal_stream_cache"),
        )
    )
    signing_secret: str = _signing_secret()
    file_url_ttl_seconds: int = int(os.environ.get("TIDALDLRU_FILE_TTL", "86400"))
    job_ttl_seconds: int = int(os.environ.get("TIDALDLRU_JOB_TTL", "86400"))
    stream_cache_max_bytes: int = int(
        os.environ.get("TIDALDLRU_STREAM_CACHE_MAX_BYTES", str(8 * 1024 * 1024 * 1024))
    )
    forwarded_allow_ips: str = os.environ.get(
        "TIDALDLRU_FORWARDED_ALLOW_IPS",
        "172.16.0.0/12,127.0.0.1,10.0.0.0/8",
    )
    fetch_lyrics: bool = _bool("TIDALDLRU_LYRICS", False)
    # Max parallel ARQ workers per process — affects pool concurrency.
    arq_max_jobs: int = int(os.environ.get("TIDALDLRU_ARQ_MAX_JOBS", "4"))
    set_audio_cache_dir: Path = Path(
        os.environ.get(
            "TIDALDLRU_SET_AUDIO_CACHE",
            str(Path(os.environ.get(
                "TIDALDLRU_JOBS_DIR",
                str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "jobs"),
            )) / "set_audio_cache"),
        )
    )


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
settings.stream_cache_dir.mkdir(parents=True, exist_ok=True)
settings.set_audio_cache_dir.mkdir(parents=True, exist_ok=True)
