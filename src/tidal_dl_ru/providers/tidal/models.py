from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AudioQuality(str, Enum):
    LOW = "LOW"
    HIGH = "HIGH"
    LOSSLESS = "LOSSLESS"
    HI_RES_LOSSLESS = "HI_RES_LOSSLESS"


class TidalModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class Artist(TidalModel):
    id: int
    name: str
    type: Optional[str] = None
    picture: Optional[str] = None


class Album(TidalModel):
    id: int
    title: str
    cover: Optional[str] = None  # UUID like "1a2b3c4d-..."
    artist: Optional[Artist] = None
    artists: list[Artist] = Field(default_factory=list)
    number_of_tracks: Optional[int] = Field(default=None, alias="numberOfTracks")
    release_date: Optional[str] = Field(default=None, alias="releaseDate")
    duration: Optional[int] = None


class Track(TidalModel):
    id: int
    title: str
    duration: int
    track_number: int = Field(alias="trackNumber")
    volume_number: int = Field(default=1, alias="volumeNumber")
    isrc: Optional[str] = None
    explicit: bool = False
    artist: Optional[Artist] = None
    artists: list[Artist] = Field(default_factory=list)
    album: Optional[Album] = None
    audio_quality: Optional[str] = Field(default=None, alias="audioQuality")
    copyright_: Optional[str] = Field(default=None, alias="copyright")
    version: Optional[str] = None


class Playlist(TidalModel):
    uuid: str
    title: str
    number_of_tracks: int = Field(alias="numberOfTracks")
    description: Optional[str] = None


class PlaybackManifest(TidalModel):
    """Response from /tracks/{id}/playbackinfopostpaywall."""

    track_id: int = Field(alias="trackId")
    audio_quality: str = Field(alias="audioQuality")
    audio_mode: Optional[str] = Field(default=None, alias="audioMode")
    manifest_mime_type: str = Field(alias="manifestMimeType")
    manifest: str  # base64-encoded
    sample_rate: Optional[int] = Field(default=None, alias="sampleRate")
    bit_depth: Optional[int] = Field(default=None, alias="bitDepth")


class DeviceAuth(TidalModel):
    device_code: str = Field(alias="deviceCode")
    user_code: str = Field(alias="userCode")
    verification_uri: str = Field(alias="verificationUri")
    verification_uri_complete: str = Field(alias="verificationUriComplete")
    expires_in: int = Field(alias="expiresIn")
    interval: int


class TokenSet(TidalModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_at: float  # epoch seconds
    user_id: Optional[int] = None
    country_code: Optional[str] = None
