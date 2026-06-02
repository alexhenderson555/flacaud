from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from tidal_dl_ru.core.models import Quality, Track


class SearchRequest(BaseModel):
    query: str
    provider: str = "tidal"
    limit: int = Field(default=10, ge=1, le=50)


class SearchResponse(BaseModel):
    tracks: list[Track]


class JobCreate(BaseModel):
    url: str
    job_type: str = "download"  # "download" or "analyze_set"
    quality: Quality = Quality.LOSSLESS
    lyrics: bool = True
    karaoke: bool = False
    dj_analyze: bool = False
    match_tidal: bool = False
    split: bool = False


class TrackProgress(BaseModel):
    title: str
    status: str  # "queued" | "downloading" | "done" | "failed" | "skipped"
    bytes_written: int = 0
    bytes_total: Optional[int] = None
    file_token: Optional[str] = None  # signed download token
    error: Optional[str] = None


class SetTrackInfo(BaseModel):
    artist: str
    title: str
    timestamp: str  # e.g. "0:00"
    matched_track: Optional[Track] = None


class JobStatus(BaseModel):
    job_id: str
    job_type: str = "download"
    status: str  # "queued" | "running" | "done" | "failed"
    provider: Optional[str] = None
    quality: Optional[str] = None
    created_at: float
    updated_at: float
    total_tracks: int = 0
    done_tracks: int = 0
    failed_tracks: int = 0
    tracks: list[TrackProgress] = []
    set_tracks: list[SetTrackInfo] = []


class PoolHealth(BaseModel):
    total: int
    active: int
    banned: int
    exhausted: int


class ProviderInfo(BaseModel):
    name: str
    display_name: str
