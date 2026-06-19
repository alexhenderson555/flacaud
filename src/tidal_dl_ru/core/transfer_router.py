from __future__ import annotations

from functools import lru_cache
from typing import Optional

from tidal_dl_ru.providers.base import Provider
from tidal_dl_ru.providers.catalog_providers import (
    AppleMusicProvider,
    DeezerProvider,
    SoundCloudProvider,
    VkMusicProvider,
    YandexMusicProvider,
    YouTubeMusicProvider,
)
from tidal_dl_ru.providers.spotify import SpotifyProvider
from tidal_dl_ru.providers.tidal import TidalProvider


@lru_cache(maxsize=1)
def transfer_providers() -> list[Provider]:
    """All sources supported by Library Transfer. First URL match wins."""
    return [
        TidalProvider(),
        SpotifyProvider(),
        AppleMusicProvider(),
        YouTubeMusicProvider(),
        YandexMusicProvider(),
        VkMusicProvider(),
        SoundCloudProvider(),
        DeezerProvider(),
    ]


def find_transfer_provider(url: str) -> Optional[Provider]:
    for provider in transfer_providers():
        if provider.supports(url):
            return provider
    return None


def get_transfer_provider_by_name(name: str) -> Optional[Provider]:
    key = (name or "").strip().lower()
    for provider in transfer_providers():
        if provider.name == key:
            return provider
    return None
