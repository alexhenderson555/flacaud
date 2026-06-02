from __future__ import annotations

import re

from tidal_dl_ru.providers.ytdlp_base import YtDlpProvider


class YouTubeMusicProvider(YtDlpProvider):
    name = "ytmusic"
    display_name = "YouTube Music"
    # Matches music.youtube.com URLs (watch?v=, playlist?list=, browse links).
    # Also accepts plain youtube.com — yt-dlp handles both equivalently.
    URL_PATTERN = re.compile(
        r"(?:music\.youtube\.com|youtube\.com|youtu\.be)/", re.IGNORECASE
    )
    # 251 = WebM opus 160k; 140 = m4a aac 128k; bestaudio picks the highest.
    format_selector = "bestaudio[ext=m4a]/bestaudio/best"
