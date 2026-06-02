"""YooKassa payment integration.

Creates payments and processes webhook notifications.
Docs: https://yookassa.ru/developers/api
"""

from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from tidal_dl_ru.bot.users import Plan, get_or_create, set_plan

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
    telegram_id: int,
    plan: Plan,
    return_url: str = "https://t.me/tidal_dl_ru_bot",
) -> Optional[str]:
    """Create a YooKassa payment and return the confirmation URL."""
    if not SHOP_ID or not SECRET_KEY:
        return None

    price = PLAN_PRICE.get(plan)
    if not price:
        return None

    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {"value": price, "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": f"tidal-dl-ru {plan.value.upper()} — Telegram {telegram_id}",
        "metadata": {
            "telegram_id": str(telegram_id),
            "plan": plan.value,
        },
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


def process_webhook(body: dict) -> bool:
    """Process a YooKassa webhook notification. Returns True if subscription updated."""
    event = body.get("event", "")
    if event != "payment.succeeded":
        return False

    obj = body.get("object", {})
    if obj.get("status") != "succeeded":
        return False

    metadata = obj.get("metadata", {})
    telegram_id_str = metadata.get("telegram_id")
    plan_str = metadata.get("plan")

    if not telegram_id_str or not plan_str:
        return False

    try:
        telegram_id = int(telegram_id_str)
        plan = Plan(plan_str)
    except (ValueError, KeyError):
        return False

    # Ensure user exists.
    get_or_create(telegram_id)

    # Calculate expiration.
    days = PLAN_DURATION_DAYS.get(plan, 30)
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)

    set_plan(telegram_id, plan, expires_at=expires_at)
    return True
