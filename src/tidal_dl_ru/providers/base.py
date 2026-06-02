from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, Optional

from tidal_dl_ru.core.models import Quality, Track

ProgressCb = Callable[[int, Optional[int]], None]


class ProviderError(Exception):
    pass


class NotSupportedHere(ProviderError):
    """Provider was given a URL it doesn't handle."""


class AuthRequired(ProviderError):
    """Provider needs a one-time login before this call."""


class Provider(ABC):
    """A music source. Implementations live under tidal_dl_ru.providers.<name>."""

    name: str  # short id like "tidal", "ytmusic"
    display_name: str  # human label

    @abstractmethod
    def supports(self, url: str) -> bool:
        """Return True if this provider can handle the given URL."""

    @abstractmethod
    def expand(self, url: str) -> list[Track]:
        """Resolve URL into a flat list of tracks (single track, album, or playlist)."""

    @abstractmethod
    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[ProgressCb] = None,
    ) -> Path:
        """Download one track. Returns the final file path (extension chosen by provider)."""

    # Optional capabilities. Default to None / unsupported.

    def search(self, query: str, limit: int = 10) -> list[Track]:
        return []

    def list_library(self) -> list[Track]:
        """Return user's saved/liked tracks. Empty if provider doesn't expose a library."""
        return []
