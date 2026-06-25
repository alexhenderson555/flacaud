"""Activation codes for plan upgrades (Telegram sales / manual grants)."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Field, Session, SQLModel, select

from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.server.subscription_apply import (
    apply_paid_plan_for_telegram,
    apply_paid_plan_for_user_id,
)


class ActivationCode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    plan: str = Field(default="pro")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: Optional[datetime] = Field(default=None)
    redeemed_at: Optional[datetime] = Field(default=None)
    redeemed_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    note: Optional[str] = Field(default=None)


def _code_alphabet() -> str:
    return string.ascii_uppercase + string.digits


def generate_code(plan: str = "pro", valid_days: int = 365, note: str | None = None) -> str:
    """Create a single-use activation code."""
    raw = "".join(secrets.choice(_code_alphabet()) for _ in range(16))
    formatted = "-".join([raw[i : i + 4] for i in range(0, 16, 4)])
    expires = datetime.now(timezone.utc) + timedelta(days=valid_days)
    with Session(db_mod.engine) as session:
        session.add(
            ActivationCode(code=formatted, plan=plan.lower(), expires_at=expires, note=note)
        )
        session.commit()
    return formatted


def redeem_code(code: str, user_id: int, telegram_id: int | None = None) -> tuple[bool, str]:
    """Apply code to user. Uses telegram_id for set_plan when present."""
    normalized = code.strip().upper().replace(" ", "")
    with Session(db_mod.engine) as session:
        row = session.exec(
            select(ActivationCode).where(ActivationCode.code == normalized)
        ).first()
        if not row:
            return False, "Invalid code"
        if row.redeemed_at:
            return False, "Code already used"
        if row.expires_at:
            exp = row.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                return False, "Code expired"
        try:
            plan = Plan(row.plan)
        except ValueError:
            return False, "Invalid plan on code"

        if telegram_id:
            apply_paid_plan_for_telegram(telegram_id, plan)
        else:
            if apply_paid_plan_for_user_id(user_id, plan) is None:
                return False, "User not found"

        row.redeemed_at = datetime.now(timezone.utc)
        row.redeemed_by_user_id = user_id
        session.add(row)
        session.commit()
    return True, f"Activated {plan.value} plan"
