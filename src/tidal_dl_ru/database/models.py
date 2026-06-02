from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime, timezone


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
    downloads_today: int = Field(default=0)
    total_downloads: int = Field(default=0)
    quota_reset_at: Optional[datetime] = Field(default=None)
    karaoke_enabled: bool = Field(default=False)
    dj_enabled: bool = Field(default=False)

    saved_tracks: List["SavedTrack"] = Relationship(back_populates="user")
    playlists: List["Playlist"] = Relationship(back_populates="user")

    @property
    def effective_plan(self) -> str:
        from datetime import timezone
        p = self.plan.lower()
        if p in ("free", "lifetime"):
            return p
        if self.subscription_expires_at:
            expires = self.subscription_expires_at
            now = datetime.now(timezone.utc)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > now:
                return p
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

class UserRead(UserBase):
    id: int
    created_at: datetime
    plan: str
    downloads_today: int
    total_downloads: int
    effective_plan: str
    daily_limit: int

class SavedTrackBase(SQLModel):
    provider: str
    provider_id: str
    title: str
    artists_json: str  # JSON list of strings
    cover_url: Optional[str] = None
    duration: Optional[int] = None
    album: Optional[str] = None
    quality: Optional[str] = None

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
    tracks_json: str = "[]" # Stores the list of tracks as JSON string to save having a complex link table for now. Can be migrated later.
    
    user: User = Relationship(back_populates="playlists")

class PlaylistRead(PlaylistBase):
    id: int
    created_at: datetime
    tracks_json: str
