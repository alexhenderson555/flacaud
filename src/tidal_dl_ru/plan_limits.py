"""Playback quality caps per subscription tier."""

from __future__ import annotations

_UI_ORDER = ("HI_RES", "LOSSLESS", "HIGH")
# Two visible player buttons; HI_RES is internal (Pro / Lifetime hi-res lossless).
PLAYER_VISIBLE_UI = ("HIGH", "LOSSLESS")

_PLAN_MAX_STREAM: dict[str, str] = {
    "free": "HIGH",
    "basic": "LOSSLESS",
    "pro": "HI_RES",
    "lifetime": "HI_RES",
}


def max_stream_quality_for_plan(plan: str | None) -> str:
    return _PLAN_MAX_STREAM.get((plan or "free").lower(), "HIGH")


def cap_stream_quality(quality: str, plan: str | None) -> str:
    """Clamp requested UI quality to the user's plan ceiling."""
    q = (quality or "HIGH").upper()
    if q == "LOW":
        q = "HIGH"
    if q == "HI_RES_LOSSLESS":
        q = "HI_RES"
    max_q = max_stream_quality_for_plan(plan)

    if q == "LOSSLESS" and max_q == "HI_RES":
        q = "HI_RES"

    if q not in _UI_ORDER:
        return max_q
    if _UI_ORDER.index(q) < _UI_ORDER.index(max_q):
        return max_q
    return q


def filter_qualities_for_player(available: list[str]) -> list[str]:
    """Drop 96k from client-facing lists; 320k is the minimum UI tier."""
    filtered = [q for q in available if q != "LOW"]
    return filtered if filtered else ["HIGH"]


def plan_allows_hires_lossless(plan: str | None) -> bool:
    return max_stream_quality_for_plan(plan) == "HI_RES"


def lossless_flac_allowed(manifest, plan: str | None) -> bool:
    """Basic = CD lossless (≤48 kHz, 16-bit). Pro / Lifetime = full hi-res FLAC."""
    if plan_allows_hires_lossless(plan):
        return True
    sr = manifest.sample_rate or 0
    bd = manifest.bit_depth or 0
    if sr > 48000:
        return False
    if bd > 16:
        return False
    return True


def visible_qualities_for_player(available: list[str]) -> list[str]:
    """Collapse internal HI_RES into the Lossless button."""
    tiers = set(filter_qualities_for_player(available))
    if "HI_RES" in tiers or "LOSSLESS" in tiers:
        tiers.add("LOSSLESS")
    tiers.add("HIGH")
    return [q for q in PLAYER_VISIBLE_UI if q in tiers]

