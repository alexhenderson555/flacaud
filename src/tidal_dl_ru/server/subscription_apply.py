"""Apply paid plans with stacked expiry and lifecycle flags."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session, select

from tidal_dl_ru.bot.users import Plan, get_or_create
from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.subscription_dates import stack_subscription_expiry


def apply_paid_plan_for_user_id(user_id: int, plan: Plan) -> Optional[User]:
    with Session(db_mod.engine) as session:
        user = session.get(User, user_id)
        if user is None:
            return None
        user.plan = plan.value
        user.subscription_expires_at = stack_subscription_expiry(user.subscription_expires_at, plan)
        user.subscription_cancel_at_period_end = False
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def apply_paid_plan_for_telegram(telegram_id: int, plan: Plan) -> Optional[User]:
    user = get_or_create(telegram_id)
    with Session(db_mod.engine) as session:
        row = session.exec(select(User).where(User.telegram_id == telegram_id)).first()
        if row is None:
            return None
        row.plan = plan.value
        row.subscription_expires_at = stack_subscription_expiry(row.subscription_expires_at, plan)
        row.subscription_cancel_at_period_end = False
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def cancel_at_period_end(user: User) -> User:
    with Session(db_mod.engine) as session:
        row = session.get(User, user.id)
        if row is None:
            return user
        row.subscription_cancel_at_period_end = True
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
