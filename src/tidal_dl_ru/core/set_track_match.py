"""Shared helpers for matching a recognized/parsed (artist, title) pair to Tidal.

Used by both the Shazam-based set analyzer and the description-tracklist parser —
factored out so the two paths dedupe/match identically.
"""

import asyncio
import logging
import re
from difflib import SequenceMatcher

from tidal_dl_ru.core.router import get_provider_by_name

logger = logging.getLogger(__name__)

# Version qualifiers that denote the same recording. Stripped only for the Tidal
# *search query* so "Kidz (Extended Mix)" resolves to the canonical release; the
# displayed title is left untouched. "Remix" is deliberately NOT stripped — a
# remix is a different track.
_VERSION_TAG_RE = re.compile(
    r"\s*[([]\s*(?:extended(?:\s+mix|\s+version)?|radio(?:\s+edit|\s+version)?|"
    r"original(?:\s+mix|\s+version)?|club\s+mix|mixed|instrumental)\s*[)\]]\s*",
    re.IGNORECASE,
)
_VERSION_SUFFIX_RE = re.compile(
    r"\s*[-–]\s*(?:extended(?:\s+mix|\s+version)?|radio\s+edit|"
    r"original(?:\s+mix|\s+version)?|club\s+mix|mixed)\s*$",
    re.IGNORECASE,
)


def clean_title_for_query(title: str) -> str:
    cleaned = _VERSION_TAG_RE.sub(" ", title or "")
    cleaned = _VERSION_SUFFIX_RE.sub("", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def dedupe_key(artist: str, title: str) -> str:
    return f"{(artist or '').lower().strip()}|{clean_title_for_query(title).lower()}"


# Tidal's search API returns an empty result set (or a 500) when the query text
# contains a literal "&" or "," -- confirmed live: "AN21 & Pretty Output Run"
# and "AN21, Pretty Output Run" both failed to find a track that "AN21 Pretty
# Output Run" (same names, space-joined) returned as the #1 hit. Shazam/parsed
# multi-artist credits routinely use these joiners ("Artist A & Artist B"), so
# this alone caused a class of real, existing tracks to show as "Not on Tidal".
_QUERY_UNSAFE_RE = re.compile(r"[,&]")

# Splits a multi-artist credit into individual names, for the primary-artist
# fallback query below.
_ARTIST_SPLIT_RE = re.compile(r"\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\bvs\.?\b)\s*", re.IGNORECASE)


def _sanitize_query_text(text: str) -> str:
    return re.sub(r"\s+", " ", _QUERY_UNSAFE_RE.sub(" ", text or "")).strip()


def _search_query_candidates(artist: str, title: str) -> list[str]:
    """Progressively broader queries to retry against Tidal's search, so one
    failed/empty top query doesn't waste the whole match attempt."""
    cleaned_title = clean_title_for_query(title)
    artist = (artist or "").strip()
    queries = []

    def add(q: str) -> None:
        q = _sanitize_query_text(q)
        if q and q not in queries:
            queries.append(q)

    add(f"{artist} {cleaned_title}")
    parts = [p for p in _ARTIST_SPLIT_RE.split(artist) if p]
    if len(parts) > 1:
        add(f"{parts[0]} {cleaned_title}")  # primary artist only
    add(cleaned_title)  # title only, last resort
    return queries


_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _normalize_for_score(text: str) -> str:
    return _NORMALIZE_RE.sub(" ", (text or "").lower()).strip()


def _match_score(candidate_title: str, candidate_artists: list, target_artist: str, target_title: str) -> float:
    """0..1 similarity of a Tidal search hit against the wanted (artist, title).
    Blindly trusting the API's #1 result was wrong often enough to matter: a
    multi-artist query like "Robin M Tromlitz" returned an unrelated "Show Me
    Love" as its first hit, with the actual correct track second."""
    title_score = SequenceMatcher(
        None,
        _normalize_for_score(clean_title_for_query(target_title)),
        _normalize_for_score(candidate_title),
    ).ratio()

    target_tokens = set(_normalize_for_score(target_artist).split())
    cand_tokens = set(_normalize_for_score(" ".join(candidate_artists or [])).split())
    artist_overlap = (len(target_tokens & cand_tokens) / len(target_tokens)) if target_tokens else 0.0

    return title_score * 0.7 + artist_overlap * 0.3


# A hit this close to perfect is worth stopping early for, instead of trying
# progressively noisier fallback queries that are more likely to surface a
# false positive.
_GOOD_ENOUGH_SCORE = 0.85
# Below this, a query "hit" is more likely an unrelated track that happened to
# share a word than the real match -- treat it the same as no result.
_MIN_ACCEPT_SCORE = 0.5


async def match_tidal_track(artist: str, title: str) -> dict | None:
    """Search Tidal for the best-scoring match across fallback queries; None if
    no provider or nothing scores above the acceptance threshold."""
    provider = get_provider_by_name("tidal")
    if not provider:
        return None
    best = None
    best_score = 0.0
    for query in _search_query_candidates(artist, title):
        try:
            tidal_tracks = await asyncio.to_thread(provider.search, query, 5)
        except Exception:
            logger.debug("set_track_match: Tidal match lookup failed for %r", query, exc_info=True)
            continue
        for candidate in tidal_tracks:
            score = _match_score(candidate.title, candidate.artists, artist, title)
            if score > best_score:
                best_score = score
                best = candidate
        if best_score >= _GOOD_ENOUGH_SCORE:
            break
    if best is not None and best_score >= _MIN_ACCEPT_SCORE:
        return best.model_dump()
    return None
