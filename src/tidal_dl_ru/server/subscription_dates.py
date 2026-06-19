"""Subscription expiry stacking (renew extends active period)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from tidal_dl_ru.bot.users import Plan

_DURATION_DAYS = {
    Plan.BASIC: 30,
    Plan.PRO: 30,
    Plan.BASIC_ANNUAL: 365,
    Plan.PRO_ANNUAL: 365,
    Plan.LIFETIME: 36500,
}


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def stack_subscription_expiry(
    current_expires: Optional[datetime],
    plan: Plan,
    *,
    now: Optional[datetime] = None,
) -> Optional[datetime]:
    """Return new expiry: extend from max(now, current) by plan duration."""
    if plan == Plan.LIFETIME:
        return None
    days = _DURATION_DAYS.get(plan, 30)
    anchor = now or datetime.now(timezone.utc)
    if current_expires is not None:
        exp = _aware(current_expires)
        if exp > anchor:
            anchor = exp
    return anchor + timedelta(days=days)
