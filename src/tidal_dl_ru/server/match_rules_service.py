"""Load and persist user-defined transfer match rules."""

from __future__ import annotations

from sqlmodel import Session, select

from tidal_dl_ru.database.models import TransferMatchRule, User
from tidal_dl_ru.providers.match_types import UserMatchRule


def rules_for_user(session: Session, user_id: int) -> list[UserMatchRule]:
    rows = session.exec(
        select(TransferMatchRule).where(TransferMatchRule.user_id == user_id)
    ).all()
    return [
        UserMatchRule(
            rule_id=row.id,
            source_platform=row.source_platform,
            source_title=row.source_title,
            source_artist=row.source_artist or "",
            tidal_provider_id=row.tidal_provider_id or "",
            block_match=bool(row.block_match),
        )
        for row in rows
    ]


def list_rules(session: Session, user: User) -> list[TransferMatchRule]:
    return list(
        session.exec(select(TransferMatchRule).where(TransferMatchRule.user_id == user.id)).all()
    )


def create_rule(
    session: Session,
    user: User,
    *,
    source_platform: str,
    source_title: str,
    source_artist: str = "",
    tidal_provider_id: str = "",
    block_match: bool = False,
) -> TransferMatchRule:
    row = TransferMatchRule(
        user_id=user.id,
        source_platform=source_platform.strip().lower()[:32],
        source_title=source_title.strip()[:512],
        source_artist=(source_artist or "").strip()[:256],
        tidal_provider_id=(tidal_provider_id or "").strip()[:64],
        block_match=bool(block_match),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_rule(session: Session, user: User, rule_id: int) -> bool:
    row = session.get(TransferMatchRule, rule_id)
    if row is None or row.user_id != user.id:
        return False
    session.delete(row)
    session.commit()
    return True
