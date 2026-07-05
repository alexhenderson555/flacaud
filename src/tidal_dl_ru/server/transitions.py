"""Transition Finder — harmonic + BPM compatibility scoring for DJ transitions.

Camelot wheel compatibility rules (standard DJ practice):
- Same key (e.g. 8A → 8A): perfect — same tonal center.
- Adjacent on same letter (8A → 7A or 9A): great — one semitone shift, smooth.
- Same number, opposite letter (8A → 8B): great — relative major/minor, shared notes.
- ±1 on opposite letter (8A → 7B or 9B): good — energetic but compatible.
- Anything else: avoid (key clash).

BPM compatibility:
- |Δbpm| ≤ 2: perfect (beatmatch without pitch shift)
- |Δbpm| ≤ 6: great (minor pitch shift or tempo nudge)
- |Δbpm| ≤ 10: ok (noticeable but workable with pitch)
- |Δbpm| > 10: avoid unless half-time/double-time
- Half-time / double-time (bpm * 2 or /2 within ±6): great (open-format trick)
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.database.models import SavedTrack

_CAMELOT_RE = re.compile(r"^(\d{1,2})([AB])$", re.IGNORECASE)

# Compatibility tiers — higher is better.
PERFECT = 4
GREAT = 3
GOOD = 2
OK = 1
AVOID = 0

_TIER_LABELS = {
    PERFECT: "perfect",
    GREAT: "great",
    GOOD: "good",
    OK: "ok",
    AVOID: "avoid",
}


@dataclass(frozen=True)
class CamelotKey:
    number: int
    letter: str

    @classmethod
    def parse(cls, raw: str | None) -> "CamelotKey | None":
        if not raw:
            return None
        m = _CAMELOT_RE.match(raw.strip())
        if not m:
            return None
        num = int(m.group(1))
        if not 1 <= num <= 12:
            return None
        return cls(number=num, letter=m.group(2).upper())


def camelot_compatibility(seed: str | None, candidate: str | None) -> int:
    """Harmonic compatibility score between two Camelot keys."""
    s = CamelotKey.parse(seed)
    c = CamelotKey.parse(candidate)
    if s is None or c is None:
        return AVOID

    if s == c:
        return PERFECT

    # Adjacent on the same ring (same letter, ±1 number, wrapping 12→1).
    if s.letter == c.letter:
        diff = abs(s.number - c.number)
        if diff == 1 or diff == 11:  # 11 = wrap (12↔1)
            return GREAT
        return AVOID

    # Opposite letter: same number = relative major/minor.
    if s.number == c.number:
        return GREAT

    # Opposite letter, ±1 number = energetic-but-compatible ("diagonal mix").
    diff = abs(s.number - c.number)
    if diff == 1 or diff == 11:
        return GOOD

    return AVOID


def bpm_compatibility(seed_bpm: float | None, candidate_bpm: float | None) -> int:
    """BPM compatibility, accounting for half-time / double-time."""
    if not seed_bpm or not candidate_bpm:
        return AVOID
    diff = abs(seed_bpm - candidate_bpm)
    if diff <= 2:
        return PERFECT
    if diff <= 6:
        return GREAT
    if diff <= 10:
        return OK

    # Half-time / double-time: a 140 BPM track mixes cleanly with a 70 BPM one.
    half = abs(seed_bpm * 0.5 - candidate_bpm)
    double = abs(seed_bpm * 2 - candidate_bpm)
    if min(half, double) <= 6:
        return GREAT
    return AVOID


def transition_score(
    seed_bpm: float | None,
    seed_key: str | None,
    cand_bpm: float | None,
    cand_key: str | None,
) -> tuple[int, str]:
    """Combined score (0-100) and a tier label."""
    if not seed_bpm or not seed_key or not cand_bpm or not cand_key:
        return 0, _TIER_LABELS[AVOID]

    harm = camelot_compatibility(seed_key, cand_key)
    tempo = bpm_compatibility(seed_bpm, cand_bpm)

    # Harmonic compatibility is the dominant factor — a key clash ruins a
    # transition even at perfect BPM. BPM match without key compat is still
    # usable but unsatisfying.
    if harm == AVOID:
        return 0, _TIER_LABELS[AVOID]
    if tempo == AVOID:
        return 0, _TIER_LABELS[AVOID]

    # Weighted blend: harmony 60%, tempo 40%.
    score = int(round(harm / PERFECT * 60 + tempo / PERFECT * 40))
    tier = max(harm, tempo)
    return score, _TIER_LABELS[tier]


def _saved_track_to_universal(row: SavedTrack) -> Track:
    """Convert a SavedTrack row into a universal Track for the API response."""
    import json

    try:
        artists = json.loads(row.artists_json) if row.artists_json else []
    except (json.JSONDecodeError, TypeError):
        artists = []
    try:
        artist_ids = json.loads(row.artist_ids_json) if row.artist_ids_json else []
    except (json.JSONDecodeError, TypeError):
        artist_ids = []

    return Track(
        provider=row.provider,
        provider_id=row.provider_id,
        title=row.title,
        artists=artists,
        artist_ids=artist_ids,
        album=row.album,
        album_id=row.album_id,
        cover_url=row.cover_url,
        duration_s=row.duration,
        release_date=row.release_date,
        quality=row.quality,
        bpm=row.bpm,
        camelot_key=row.camelot_key,
        musical_key=row.musical_key,
    )


def find_transitions(
    saved: list[SavedTrack],
    seed_provider_id: str,
    *,
    bpm_tolerance: int = 6,
    limit: int = 20,
) -> list[dict]:
    """Rank library tracks by transition compatibility with the seed.

    Returns a list of dicts: {track, score, tier, bpm_diff, harmonic, tempo}.
    The seed itself and tracks missing bpm/camelot_key are skipped.
    """
    seed_row = next(
        (r for r in saved if str(r.provider_id) == str(seed_provider_id)),
        None,
    )
    if seed_row is None or not seed_row.bpm or not seed_row.camelot_key:
        return []

    seed_bpm = float(seed_row.bpm)
    seed_key = seed_row.camelot_key

    out: list[dict] = []
    for row in saved:
        if str(row.provider_id) == str(seed_provider_id):
            continue
        if not row.bpm or not row.camelot_key:
            continue
        cand_bpm = float(row.bpm)
        score, tier = transition_score(
            seed_bpm, seed_key, cand_bpm, row.camelot_key,
        )
        if score <= 0:
            continue
        # Soft filter: skip tracks far outside the BPM window even if
        # half-time saved them — they feel wrong in a focused transition list.
        if abs(seed_bpm - cand_bpm) > bpm_tolerance and tier != "great":
            continue
        out.append({
            "track": _saved_track_to_universal(row).model_dump(),
            "bpm": int(cand_bpm),
            "camelot_key": row.camelot_key,
            "musical_key": row.musical_key,
            "score": score,
            "tier": tier,
            "bpm_diff": round(cand_bpm - seed_bpm, 1),
            "harmonic": _TIER_LABELS[camelot_compatibility(seed_key, row.camelot_key)],
            "tempo": _TIER_LABELS[bpm_compatibility(seed_bpm, cand_bpm)],
        })

    out.sort(key=lambda x: (x["score"], -abs(x["bpm_diff"])), reverse=True)
    return out[:limit]
