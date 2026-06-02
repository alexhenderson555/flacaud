from __future__ import annotations

from functools import lru_cache
from typing import Optional

from tidal_dl_ru.providers.apple_music import AppleMusicProvider
from tidal_dl_ru.providers.bandcamp import BandcampProvider
from tidal_dl_ru.providers.base import Provider
from tidal_dl_ru.providers.soundcloud import SoundCloudProvider
from tidal_dl_ru.providers.spotify import SpotifyProvider
from tidal_dl_ru.providers.tidal import TidalProvider
from tidal_dl_ru.providers.ytmusic import YouTubeMusicProvider


@lru_cache(maxsize=1)
def all_providers() -> list[Provider]:
    """Order matters: first matching URL pattern wins."""
    return [
        TidalProvider(),
        SpotifyProvider(),
        AppleMusicProvider(),
        YouTubeMusicProvider(),
        SoundCloudProvider(),
        BandcampProvider(),
    ]


def find_provider(url: str) -> Optional[Provider]:
    for p in all_providers():
        if p.supports(url):
            return p
    return None


def get_provider_by_name(name: str) -> Optional[Provider]:
    for p in all_providers():
        if p.name == name:
            return p
    return None
