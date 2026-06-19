from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

class UserBase(SQLModel):
    email: Optional[str] = Field(default=None, unique=True, index=True)
    username: Optional[str] = Field(default=None, unique=True, index=True)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)

    telegram_id: Optional[int] = Field(default=None, unique=True, index=True)
    first_name: Optional[str] = Field(default=None)
    plan: str = Field(default="free")
    subscription_expires_at: Optional[datetime] = Field(default=None)
    subscription_cancel_at_period_end: bool = Field(default=False)
    downloads_today: int = Field(default=0)
    total_downloads: int = Field(default=0)
    quota_reset_at: Optional[datetime] = Field(default=None)
    karaoke_enabled: bool = Field(default=False)
    dj_enabled: bool = Field(default=False)
    email_verified: bool = Field(default=False)

    saved_tracks: List["SavedTrack"] = Relationship(back_populates="user")
    playlists: List["Playlist"] = Relationship(back_populates="user")
    saved_sets: List["SavedSet"] = Relationship(back_populates="user")

    @property
    def effective_plan(self) -> str:
        from datetime import timezone

        p = self.plan.lower()
        tier = {"basic_annual": "basic", "pro_annual": "pro"}.get(p, p)
        if tier in ("free", "lifetime"):
            return tier
        if self.subscription_expires_at:
            expires = self.subscription_expires_at
            now = datetime.now(timezone.utc)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > now:
                return tier
        return "free"

    @property
    def daily_limit(self) -> int:
        limits = {"free": 3, "basic": 50, "pro": 200, "lifetime": 200}
        return limits.get(self.effective_plan, 3)

    @property
    def can_download(self) -> bool:
        return self.downloads_today < self.daily_limit

class UserCreate(UserBase):
    password: str
    accept_terms: bool = False

class UserRead(UserBase):
    id: int
    created_at: datetime
    plan: str
    downloads_today: int
    total_downloads: int
    effective_plan: str
    daily_limit: int
    subscription_expires_at: Optional[datetime] = None
    subscription_cancel_at_period_end: bool = False
    dj_enabled: bool = False
    karaoke_enabled: bool = False
    email_verified: bool = False

class SavedTrackBase(SQLModel):
    provider: str
    provider_id: str
    title: str
    artists_json: str  # JSON list of strings
    artist_ids_json: Optional[str] = None  # JSON list of Tidal artist ids
    album_id: Optional[str] = None
    cover_url: Optional[str] = None
    duration: Optional[int] = None
    album: Optional[str] = None
    release_date: Optional[str] = Field(default=None, max_length=16)  # ISO YYYY-MM-DD
    quality: Optional[str] = None
    bpm: Optional[int] = None
    camelot_key: Optional[str] = Field(default=None, max_length=8)
    musical_key: Optional[str] = Field(default=None, max_length=24)

class SavedTrack(SavedTrackBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    added_at: datetime = Field(default_factory=_utcnow)

    user: User = Relationship(back_populates="saved_tracks")

class PlaylistBase(SQLModel):
    name: str

class Playlist(PlaylistBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=_utcnow)
    share_token: Optional[str] = Field(default=None, unique=True, index=True)

    user: User = Relationship(back_populates="playlists")
    track_rows: List["PlaylistTrack"] = Relationship(back_populates="playlist")


class PlaylistTrack(SQLModel, table=True):
    """Normalized playlist row (dual-written with tracks_json during migration)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    playlist_id: int = Field(foreign_key="playlist.id", index=True)
    position: int = Field(default=0)
    provider: str
    provider_id: str
    title: str
    artists_json: str = "[]"
    album: Optional[str] = None
    duration_s: Optional[int] = None
    cover_url: Optional[str] = None
    quality: Optional[str] = None

    playlist: Playlist = Relationship(back_populates="track_rows")


class TransferMatchRule(SQLModel, table=True):
    """User override: force Tidal match or block a source track."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    source_platform: str = Field(max_length=32)
    source_title: str = Field(max_length=512)
    source_artist: str = Field(default="", max_length=256)
    tidal_provider_id: str = Field(default="", max_length=64)
    block_match: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)


class SavedSetBase(SQLModel):
    url: str = Field(max_length=2048)
    title: str = Field(default="DJ set", max_length=512)
    track_count: int = Field(default=0)
    duration_seconds: int = Field(default=0)
    tracks_json: str = Field(default="[]")


class SavedSet(SavedSetBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    saved_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    share_token: Optional[str] = Field(default=None, unique=True, index=True)

    user: User = Relationship(back_populates="saved_sets")


class SavedSetRead(SavedSetBase):
    id: int
    saved_at: datetime
    updated_at: datetime
    share_token: Optional[str] = None

class PlaylistRead(PlaylistBase):
    id: int
    created_at: datetime
