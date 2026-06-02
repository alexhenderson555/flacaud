from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime

class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    username: str = Field(unique=True, index=True)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    saved_tracks: List["SavedTrack"] = Relationship(back_populates="user")
    playlists: List["Playlist"] = Relationship(back_populates="user")

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    created_at: datetime

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
    added_at: datetime = Field(default_factory=datetime.utcnow)
    
    user: User = Relationship(back_populates="saved_tracks")

class PlaylistBase(SQLModel):
    name: str

class Playlist(PlaylistBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    tracks_json: str = "[]" # Stores the list of tracks as JSON string to save having a complex link table for now. Can be migrated later.
    
    user: User = Relationship(back_populates="playlists")

class PlaylistRead(PlaylistBase):
    id: int
    created_at: datetime
    tracks_json: str
