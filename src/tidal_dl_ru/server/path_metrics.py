"""Normalize URL paths for low-cardinality Prometheus labels."""

from __future__ import annotations

import re

_PATH_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^/api/stream/\d+"), "/api/stream/{id}"),
    (re.compile(r"^/api/quality/[^/]+"), "/api/quality/{id}"),
    (re.compile(r"^/api/tracks/\d+"), "/api/tracks/{id}"),
    (re.compile(r"^/api/albums/\d+"), "/api/albums/{id}"),
    (re.compile(r"^/api/artists/\d+"), "/api/artists/{id}"),
    (re.compile(r"^/api/playlists/[^/]+"), "/api/playlists/{id}"),
    (re.compile(r"^/api/jobs/[^/]+"), "/api/jobs/{id}"),
    (re.compile(r"^/api/transfer/[^/]+"), "/api/transfer/{id}"),
    (re.compile(r"^/api/share/[^/]+"), "/api/share/{id}"),
    (re.compile(r"^/artist/\d+"), "/artist/{id}"),
    (re.compile(r"^/album/\d+"), "/album/{id}"),
    (re.compile(r"^/s/[^/]+"), "/s/{token}"),
)


def normalize_path(path: str) -> str:
    path = (path or "/").split("?", 1)[0] or "/"
    for pattern, replacement in _PATH_RULES:
        if pattern.match(path):
            return replacement
    return path
