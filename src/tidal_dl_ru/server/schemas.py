from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.server.outbound_url import OutboundUrlError, validate_public_http_url


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    provider: str = Field(default="tidal", max_length=32)
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SearchResponse(BaseModel):
    tracks: list[Track]
    has_more: bool = False
    suggested_query: Optional[str] = None
    suggestion_kind: Optional[str] = None  # layout | typo


class JobCreate(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    job_type: str = "download"  # "download" or "analyze_set"
    quality: Quality = Quality.LOSSLESS
    lyrics: bool = False
    karaoke: bool = False
    dj_analyze: bool = False
    match_tidal: bool = False

    @field_validator("url")
    @classmethod
    def _validate_job_url(cls, value: str) -> str:
        try:
            return validate_public_http_url(value)
        except OutboundUrlError as exc:
            raise ValueError(str(exc)) from exc


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


class AnalysisProgress(BaseModel):
    """Structured progress for analyze_set jobs (poll /api/jobs/{id})."""

    phase: str  # queued | download | process | scan | done | failed
    percent: int = 0
    segments_done: int = 0
    segments_total: int = 0
    tracks_found: int = 0
    label: str = ""


class JobStatus(BaseModel):
    job_id: str
    owner_id: Optional[int] = None  # web user id that created the job (ownership guard)
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
    analysis: Optional[AnalysisProgress] = None


class JobHistoryItem(BaseModel):
    job_id: str
    status: str
    quality: Optional[str] = None
    created_at: float
    updated_at: float
    total_tracks: int = 0
    done_tracks: int = 0
    track_titles: list[str] = []
    file_token: Optional[str] = None  # single-track direct download


class PoolHealth(BaseModel):
    total: int
    active: int
    banned: int
    exhausted: int


class ProviderInfo(BaseModel):
    name: str
    display_name: str
