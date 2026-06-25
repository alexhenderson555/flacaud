"""User-defined transfer match rules API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.match_rules_service import create_rule, delete_rule, list_rules

router = APIRouter(prefix="/api/transfer/match-rules", tags=["transfer"])


class MatchRuleCreate(BaseModel):
    source_platform: str = Field(min_length=1, max_length=32)
    source_title: str = Field(min_length=1, max_length=512)
    source_artist: str = Field(default="", max_length=256)
    tidal_provider_id: str = Field(default="", max_length=64)
    block_match: bool = False


class MatchRuleRead(BaseModel):
    id: int
    source_platform: str
    source_title: str
    source_artist: str
    tidal_provider_id: str
    block_match: bool


@router.get("", response_model=list[MatchRuleRead])
def get_match_rules(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MatchRuleRead]:
    rows = list_rules(session, current_user)
    return [
        MatchRuleRead(
            id=row.id,
            source_platform=row.source_platform,
            source_title=row.source_title,
            source_artist=row.source_artist or "",
            tidal_provider_id=row.tidal_provider_id or "",
            block_match=bool(row.block_match),
        )
        for row in rows
        if row.id is not None
    ]


@router.post("", response_model=MatchRuleRead)
def add_match_rule(
    body: MatchRuleCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MatchRuleRead:
    if not body.block_match and not body.tidal_provider_id.strip():
        raise HTTPException(status_code=400, detail="Provide tidal_provider_id or set block_match")
    row = create_rule(
        session,
        current_user,
        source_platform=body.source_platform,
        source_title=body.source_title,
        source_artist=body.source_artist,
        tidal_provider_id=body.tidal_provider_id,
        block_match=body.block_match,
    )
    return MatchRuleRead(
        id=row.id,
        source_platform=row.source_platform,
        source_title=row.source_title,
        source_artist=row.source_artist or "",
        tidal_provider_id=row.tidal_provider_id or "",
        block_match=bool(row.block_match),
    )


@router.delete("/{rule_id}")
def remove_match_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    if not delete_rule(session, current_user, rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}
