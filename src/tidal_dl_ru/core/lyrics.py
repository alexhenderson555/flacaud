from __future__ import annotations

from pathlib import Path
from typing import Optional

import syncedlyrics

from tidal_dl_ru.core.models import Track


def fetch_synced_lrc(track: Track, providers: Optional[list[str]] = None) -> Optional[str]:
    """Return synced LRC text for the track, or None if not found.

    Order of providers: LRCLIB → NetEase → Musixmatch by default. We require
    synced timestamps; if only plain lyrics are available, we skip.
    """
    query = f"{track.primary_artist} {track.title}"
    try:
        lrc = syncedlyrics.search(
            query,
            synced_only=True,
            providers=providers or ["Lrclib", "NetEase", "Musixmatch"],
        )
    except Exception:
        return None
    return lrc or None


def write_sidecar(lrc_text: str, audio_path: Path) -> Path:
    """Write `.lrc` sidecar next to the audio file. Return the sidecar path."""
    sidecar = audio_path.with_suffix(".lrc")
    sidecar.write_text(lrc_text, encoding="utf-8")
    return sidecar
