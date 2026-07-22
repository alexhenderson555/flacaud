"""YooKassa payment integration.

Creates payments and processes webhook notifications.
Docs: https://yookassa.ru/developers/api
"""

from __future__ import annotations

import logging
import os
import uuid
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import ProcessedPayment
from tidal_dl_ru.server.subscription_apply import (
    apply_paid_plan_for_telegram,
    apply_paid_plan_for_user_id,
)

log = logging.getLogger(__name__)

YOOKASSA_API = "https://api.yookassa.ru/v3"

SHOP_ID = os.environ.get("TIDALDLRU_YOOKASSA_SHOP_ID", "")
SECRET_KEY = os.environ.get("TIDALDLRU_YOOKASSA_SECRET_KEY", "")

# Plan → price in RUB.
PLAN_PRICE = {
    Plan.BASIC: "199.00",
    Plan.PRO: "399.00",
    Plan.BASIC_ANNUAL: "1910.00",
    Plan.PRO_ANNUAL: "3830.00",
    Plan.LIFETIME: "4990.00",
}

# Plan → subscription duration in days (lifetime = 36500 ≈ 100 years).
PLAN_DURATION_DAYS = {
    Plan.BASIC: 30,
    Plan.PRO: 30,
    Plan.BASIC_ANNUAL: 365,
    Plan.PRO_ANNUAL: 365,
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
        desc = f"FlacAud {plan.value.upper()} — Telegram {telegram_id}"
    else:
        metadata["user_id"] = str(user_id)
        desc = f"FlacAud {plan.value.upper()} — Web user {user_id}"

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


def _claim_payment_id(payment_id: str) -> bool:
    """Atomically record payment_id as processed. Returns False if it was
    ALREADY recorded (webhook retry / duplicate delivery) — the caller must
    skip crediting in that case, since YooKassa can and does redeliver
    payment.succeeded even after a successful 200 response."""
    with Session(db_mod.engine) as session:
        try:
            session.add(ProcessedPayment(payment_id=payment_id))
            session.commit()
        except IntegrityError:
            session.rollback()
            return False
        return True


def _process_payment_canceled(body: dict) -> bool:
    """Acknowledge canceled checkout; no plan change (dunning/recurring is future work)."""
    obj = body.get("object", {}) or {}
    payment_id = obj.get("id")
    if not payment_id:
        return False
    verified = _fetch_payment(str(payment_id))
    if not verified or verified.get("status") != "canceled":
        return False
    meta = verified.get("metadata", {}) or {}
    log.info(
        "payment canceled user_id=%s telegram_id=%s plan=%s",
        meta.get("user_id"),
        meta.get("telegram_id"),
        meta.get("plan"),
    )
    return True


def process_webhook(body: dict) -> bool:
    """Process a YooKassa webhook. Returns True only if a *verified* payment
    succeeded and the subscription was updated.

    The webhook body is treated as an untrusted hint: we take the payment id
    from it, then re-fetch the payment server-side and trust only that response.
    """
    event = body.get("event", "")
    if event == "payment.canceled":
        return _process_payment_canceled(body)
    if event != "payment.succeeded":
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
    if expected_price:
        # A missing/blank amount is as suspicious as a wrong one — don't
        # silently treat "nothing to compare" as a pass.
        if not paid_value:
            return False
        # Numeric compare so "199" / "199.0" / "199.00" don't reject a valid pay.
        try:
            if Decimal(str(paid_value)) != Decimal(str(expected_price)):
                return False
        except (InvalidOperation, ValueError):
            return False

    # Idempotency: YooKassa redelivers payment.succeeded on retries, and a
    # verified-succeeded payment_id must only ever credit a plan once.
    if not _claim_payment_id(str(payment_id)):
        log.info("payment_id=%s already processed, skipping duplicate credit", payment_id)
        return True

    telegram_id_str = metadata.get("telegram_id")
    user_id_str = metadata.get("user_id")

    if telegram_id_str:
        try:
            telegram_id = int(telegram_id_str)
        except ValueError:
            return False
        return apply_paid_plan_for_telegram(telegram_id, plan) is not None

    if user_id_str:
        try:
            user_id = int(user_id_str)
        except ValueError:
            return False
        user = apply_paid_plan_for_user_id(user_id, plan)
        if user is None:
            return False
        if user.telegram_id:
            apply_paid_plan_for_telegram(user.telegram_id, plan)
        return True

    return False
