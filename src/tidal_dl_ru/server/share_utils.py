from __future__ import annotations

import json
import secrets
from typing import Any


def new_share_token() -> str:
    """Short URL-safe token for /s/{token} links."""
    return secrets.token_urlsafe(6)[:10]


def parse_tracks_json(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def track_duration_seconds(track: dict[str, Any]) -> int:
    for key in ("duration", "duration_s", "duration_seconds"):
        val = track.get(key)
        if val is None:
            continue
        try:
            n = int(val)
            if n > 0:
                return n
        except (TypeError, ValueError):
            continue
    return 0


def sum_track_durations(tracks: list[dict[str, Any]]) -> int:
    return sum(track_duration_seconds(t) for t in tracks)
