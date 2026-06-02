from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class Quality(str, Enum):
    """Logical quality tier. Each provider maps it to its own native option."""

    LOW = "LOW"
    HIGH = "HIGH"
    LOSSLESS = "LOSSLESS"
    HI_RES = "HI_RES"


class _M(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Track(_M):
    """Universal track. All providers map their native models to this."""

    provider: str
    provider_id: str
    title: str
    artists: list[str]
    artist_ids: list[str] = []
    album: Optional[str] = None
    album_id: Optional[str] = None
    album_artist: Optional[str] = None
    track_number: int = 1
    disc_number: int = 1
    total_tracks: Optional[int] = None
    duration_s: Optional[int] = None
    isrc: Optional[str] = None
    explicit: bool = False
    year: Optional[int] = None
    release_date: Optional[str] = None  # ISO YYYY-MM-DD when known
    cover_url: Optional[str] = None
    copyright_: Optional[str] = None
    source_url: Optional[str] = None
    version: Optional[str] = None  # e.g. "Remastered", "Radio Edit"
    quality: Optional[str] = None

    @property
    def primary_artist(self) -> str:
        return self.artists[0] if self.artists else "Unknown"


class Album(_M):
    provider: str
    provider_id: str
    title: str
    artist: str
    track_count: Optional[int] = None
    year: Optional[int] = None
    release_date: Optional[str] = None
    cover_url: Optional[str] = None
    source_url: Optional[str] = None


class Playlist(_M):
    provider: str
    provider_id: str
    title: str
    track_count: Optional[int] = None
    source_url: Optional[str] = None
