"""Shared types for library transfer matching."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MatchDetail:
    position: int
    matched: bool
    method: str
    score: Optional[float] = None
    source_title: str = ""
    source_artists: list[str] = field(default_factory=list)
    tidal_title: Optional[str] = None
    tidal_artists: Optional[list[str]] = None
    tidal_provider_id: Optional[str] = None
    query: Optional[str] = None

    def to_preview_dict(self) -> dict:
        row: dict = {
            "matched": self.matched,
            "match_method": self.method,
            "match_score": self.score,
            "source_title": self.source_title,
            "source_artists": self.source_artists,
        }
        if self.matched and self.tidal_provider_id:
            row.update(
                {
                    "provider_id": self.tidal_provider_id,
                    "title": self.tidal_title or self.source_title,
                    "artists": self.tidal_artists or self.source_artists,
                }
            )
        return row


@dataclass
class UserMatchRule:
    """In-memory rule applied during Tidal matching."""

    source_platform: str
    source_title: str
    source_artist: str = ""
    tidal_provider_id: str = ""
    block_match: bool = False
    rule_id: Optional[int] = None
