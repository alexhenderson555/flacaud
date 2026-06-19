"""Telegram DM for subscription reminders."""

from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)


def send_subscription_telegram(telegram_id: int, text: str) -> bool:
    token = (os.environ.get("TIDALDLRU_BOT_TOKEN") or "").strip()
    if not token or not telegram_id:
        return False
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": telegram_id, "text": text, "parse_mode": "HTML"},
            )
        if res.status_code != 200:
            log.warning(
                "subscription_telegram_failed chat_id=%s status=%s",
                telegram_id,
                res.status_code,
            )
            return False
        return True
    except httpx.HTTPError:
        log.exception("subscription_telegram_failed chat_id=%s", telegram_id)
        return False
