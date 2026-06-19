"""Minimal Gemini text generation helper."""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_GEMINI_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
)


def gemini_models() -> tuple[str, ...]:
    raw = os.environ.get("TIDALDLRU_GEMINI_MODELS", "").strip()
    if not raw:
        return _DEFAULT_GEMINI_MODELS
    return tuple(m.strip() for m in raw.split(",") if m.strip())


async def gemini_generate_text(prompt: str, *, temperature: float = 0.4) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return ""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }

    async with httpx.AsyncClient() as client:
        for model in gemini_models():
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={api_key}"
            )
            res = await client.post(url, json=payload, timeout=30.0)
            if res.status_code != 200:
                logger.warning(
                    "Gemini error model=%s status=%s body=%s",
                    model,
                    res.status_code,
                    (res.text or "")[:240],
                )
                continue
            data = res.json()
            candidates = data.get("candidates") or []
            if not candidates:
                continue
            parts_out = candidates[0].get("content", {}).get("parts") or []
            if not parts_out:
                continue
            text = (parts_out[0].get("text") or "").strip()
            if text:
                return text
    return ""
