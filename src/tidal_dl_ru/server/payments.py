"""YooKassa payment integration.

Creates payments and processes webhook notifications.
Docs: https://yookassa.ru/developers/api
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlmodel import Session

from tidal_dl_ru.bot.users import Plan, get_or_create, set_plan, set_plan_for_user_id
from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import User

YOOKASSA_API = "https://api.yookassa.ru/v3"

SHOP_ID = os.environ.get("TIDALDLRU_YOOKASSA_SHOP_ID", "")
SECRET_KEY = os.environ.get("TIDALDLRU_YOOKASSA_SECRET_KEY", "")

# Plan → price in RUB.
PLAN_PRICE = {
    Plan.BASIC: "199.00",
    Plan.PRO: "399.00",
    Plan.LIFETIME: "4990.00",
}

# Plan → subscription duration in days (lifetime = 36500 ≈ 100 years).
PLAN_DURATION_DAYS = {
    Plan.BASIC: 30,
    Plan.PRO: 30,
    Plan.LIFETIME: 36500,
}


def create_payment(
    plan: Plan,
    return_url: str = "https://t.me/tidal_dl_ru_bot",
    *,
    telegram_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> Optional[str]:
    """Create a YooKassa payment and return the confirmation URL."""
    if not SHOP_ID or not SECRET_KEY:
        return None
    if not telegram_id and not user_id:
        return None

    price = PLAN_PRICE.get(plan)
    if not price:
        return None

    metadata = {"plan": plan.value}
    if telegram_id:
        metadata["telegram_id"] = str(telegram_id)
        desc = f"tidal-dl-ru {plan.value.upper()} — Telegram {telegram_id}"
    else:
        metadata["user_id"] = str(user_id)
        desc = f"tidal-dl-ru {plan.value.upper()} — Web user {user_id}"

    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {"value": price, "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": desc,
        "metadata": metadata,
    }

    resp = httpx.post(
        f"{YOOKASSA_API}/payments",
        json=payload,
        auth=(SHOP_ID, SECRET_KEY),
        headers={"Idempotence-Key": idempotency_key},
        timeout=15.0,
    )
    if resp.status_code not in (200, 201):
        return None

    data = resp.json()
    return data.get("confirmation", {}).get("confirmation_url")


def _fetch_payment(payment_id: str) -> Optional[dict]:
    """Re-fetch a payment from YooKassa's API — the only authoritative source.

    Webhook bodies are attacker-spoofable (anyone can POST JSON); the IP
    allowlist in the route is bypassable via X-Forwarded-For. So we never trust
    the body: we pull the payment straight from YooKassa with our secret key and
    act only on what *they* report. Returns None if it can't be verified.
    """
    if not SHOP_ID or not SECRET_KEY:
        return None
    try:
        resp = httpx.get(
            f"{YOOKASSA_API}/payments/{payment_id}",
            auth=(SHOP_ID, SECRET_KEY),
            timeout=15.0,
        )
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    return resp.json()


def process_webhook(body: dict) -> bool:
    """Process a YooKassa webhook. Returns True only if a *verified* payment
    succeeded and the subscription was updated.

    The webhook body is treated as an untrusted hint: we take the payment id
    from it, then re-fetch the payment server-side and trust only that response.
    """
    if body.get("event", "") != "payment.succeeded":
        return False

    obj = body.get("object", {}) or {}
    payment_id = obj.get("id")
    if not payment_id:
        return False

    # Authoritative server-side verification — never trust the body alone.
    verified = _fetch_payment(str(payment_id))
    if not verified:
        return False
    if verified.get("status") != "succeeded" or not verified.get("paid", False):
        return False

    metadata = verified.get("metadata", {}) or {}
    plan_str = metadata.get("plan")
    if not plan_str:
        return False

    try:
        plan = Plan(plan_str)
    except (ValueError, KeyError):
        return False

    expected_price = PLAN_PRICE.get(plan)
    paid_value = (verified.get("amount") or {}).get("value")
    if expected_price and paid_value and str(paid_value) != str(expected_price):
        return False

    days = PLAN_DURATION_DAYS.get(plan, 30)
    expires_at = None if plan == Plan.LIFETIME else datetime.now(timezone.utc) + timedelta(days=days)

    telegram_id_str = metadata.get("telegram_id")
    user_id_str = metadata.get("user_id")

    if telegram_id_str:
        try:
            telegram_id = int(telegram_id_str)
        except ValueError:
            return False
        get_or_create(telegram_id)
        set_plan(telegram_id, plan, expires_at=expires_at)
        return True

    if user_id_str:
        try:
            user_id = int(user_id_str)
        except ValueError:
            return False
        set_plan_for_user_id(user_id, plan, expires_at=expires_at)
        with Session(db_mod.engine) as session:
            user = session.get(User, user_id)
            if user and user.telegram_id:
                set_plan(user.telegram_id, plan, expires_at=expires_at)
        return True

    return False
