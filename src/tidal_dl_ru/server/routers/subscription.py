"""Subscription lifecycle: cancel at period end, status."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.subscription_apply import cancel_at_period_end

router = APIRouter(prefix="/api/subscription", tags=["subscription"])


class SubscriptionStatusResponse(BaseModel):
    plan: str
    effective_plan: str
    subscription_expires_at: Optional[datetime] = None
    cancel_at_period_end: bool = False
    days_remaining: Optional[int] = None


class CancelResponse(BaseModel):
    ok: bool
    cancel_at_period_end: bool
    subscription_expires_at: Optional[datetime] = None
    message: str


@router.get("/status", response_model=SubscriptionStatusResponse)
def subscription_status(current_user: User = Depends(get_current_user)) -> SubscriptionStatusResponse:
    days = None
    if current_user.subscription_expires_at:
        from datetime import timezone

        exp = current_user.subscription_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        delta = exp - datetime.now(timezone.utc)
        days = max(0, delta.days)
    return SubscriptionStatusResponse(
        plan=current_user.plan,
        effective_plan=current_user.effective_plan,
        subscription_expires_at=current_user.subscription_expires_at,
        cancel_at_period_end=bool(current_user.subscription_cancel_at_period_end),
        days_remaining=days,
    )


@router.post("/cancel", response_model=CancelResponse)
def subscription_cancel(current_user: User = Depends(get_current_user)) -> CancelResponse:
    plan = (current_user.plan or "free").lower()
    if plan in ("free", "lifetime"):
        raise HTTPException(status_code=400, detail="Nothing to cancel on this plan")
    if not current_user.subscription_expires_at and plan != "lifetime":
        raise HTTPException(status_code=400, detail="No active subscription period")
    user = cancel_at_period_end(current_user)
    return CancelResponse(
        ok=True,
        cancel_at_period_end=True,
        subscription_expires_at=user.subscription_expires_at,
        message="Auto-renew cancelled — access continues until the period ends.",
    )
