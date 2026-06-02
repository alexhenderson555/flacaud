from __future__ import annotations

import re

from tidal_dl_ru.providers.ytdlp_base import YtDlpProvider


class SoundCloudProvider(YtDlpProvider):
    name = "soundcloud"
    display_name = "SoundCloud"
    URL_PATTERN = re.compile(r"(?:soundcloud\.com|snd\.sc)/", re.IGNORECASE)
    format_selector = "bestaudio/best"
