"""Playback quality caps per subscription tier."""

from __future__ import annotations

_UI_ORDER = ("HI_RES", "LOSSLESS", "HIGH", "LOW")

_PLAN_MAX_STREAM: dict[str, str] = {
    "free": "LOW",
    "basic": "HIGH",
    "pro": "HI_RES",
    "lifetime": "HI_RES",
}


def max_stream_quality_for_plan(plan: str | None) -> str:
    return _PLAN_MAX_STREAM.get((plan or "free").lower(), "LOW")


def cap_stream_quality(quality: str, plan: str | None) -> str:
    """Clamp requested UI quality to the user's plan ceiling."""
    q = (quality or "LOW").upper()
    if q == "HI_RES_LOSSLESS":
        q = "HI_RES"
    max_q = max_stream_quality_for_plan(plan)
    if q not in _UI_ORDER:
        return max_q
    if _UI_ORDER.index(q) < _UI_ORDER.index(max_q):
        return max_q
    return q
