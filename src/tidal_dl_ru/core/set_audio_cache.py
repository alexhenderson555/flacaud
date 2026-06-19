from __future__ import annotations

import hashlib
import logging
import shutil
from pathlib import Path

from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)


def normalize_set_url(url: str) -> str:
    return (url or "").strip()


def cache_key(url: str) -> str:
    normalized = normalize_set_url(url)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:40]


def cache_path(url: str) -> Path:
    return settings.set_audio_cache_dir / f"{cache_key(url)}.mp3"


def has_cached_set_audio(url: str) -> bool:
    path = cache_path(url)
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def store_set_audio(url: str, source: Path) -> Path | None:
    """Copy analyzed set MP3 into persistent cache keyed by set URL."""
    if not source.is_file():
        return None
    dest = cache_path(url)
    try:
        settings.set_audio_cache_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
        return dest
    except Exception as exc:
        logger.warning("Failed to cache set audio for %r: %s", url, exc)
        return None
