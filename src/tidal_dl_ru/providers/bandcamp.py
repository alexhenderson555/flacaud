from __future__ import annotations

import re

from tidal_dl_ru.providers.ytdlp_base import YtDlpProvider


class BandcampProvider(YtDlpProvider):
    name = "bandcamp"
    display_name = "Bandcamp"
    URL_PATTERN = re.compile(r"\.bandcamp\.com/", re.IGNORECASE)
    # Bandcamp streams 128k MP3 for non-purchased; for purchased tracks yt-dlp
    # downloads the highest available format (often FLAC).
    format_selector = "bestaudio/best"
