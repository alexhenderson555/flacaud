from __future__ import annotations

import re

from tidal_dl_ru.providers.ytdlp_base import YtDlpCatalogProvider
from tidal_dl_ru.providers.ytmusic_native import YouTubeMusicNativeProvider


class AppleMusicProvider(YtDlpCatalogProvider):
    name = "apple"
    display_name = "Apple Music"
    URL_PATTERN = re.compile(r"https?://music\.apple\.com/", re.IGNORECASE)


class YouTubeMusicProvider(YouTubeMusicNativeProvider):
    name = "ytmusic"
    display_name = "YouTube Music"
    URL_PATTERN = re.compile(
        r"(?:music\.youtube\.com|youtube\.com|youtu\.be)/",
        re.IGNORECASE,
    )
    format_selector = "bestaudio[ext=m4a]/bestaudio/best"


class SoundCloudProvider(YtDlpCatalogProvider):
    name = "soundcloud"
    display_name = "SoundCloud"
    URL_PATTERN = re.compile(r"(?:soundcloud\.com|snd\.sc)/", re.IGNORECASE)


class DeezerProvider(YtDlpCatalogProvider):
    name = "deezer"
    display_name = "Deezer"
    URL_PATTERN = re.compile(r"(?:deezer\.com|dzcdn\.net)/", re.IGNORECASE)


class YandexMusicProvider(YtDlpCatalogProvider):
    name = "yandex"
    display_name = "Yandex Music"
    URL_PATTERN = re.compile(r"music\.yandex\.", re.IGNORECASE)


class VkMusicProvider(YtDlpCatalogProvider):
    name = "vk"
    display_name = "VK Music"
    URL_PATTERN = re.compile(r"vk\.com/", re.IGNORECASE)
