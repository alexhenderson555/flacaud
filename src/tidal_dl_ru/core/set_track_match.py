"""Shared helpers for matching a recognized/parsed (artist, title) pair to Tidal.

Used by both the Shazam-based set analyzer and the description-tracklist parser —
factored out so the two paths dedupe/match identically.
"""

import asyncio
import logging
import re

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


async def match_tidal_track(artist: str, title: str) -> dict | None:
    """Search Tidal for the best match; None if no provider or no hit."""
    provider = get_provider_by_name("tidal")
    if not provider:
        return None
    for query in _search_query_candidates(artist, title):
        try:
            tidal_tracks = await asyncio.to_thread(provider.search, query, 1)
        except Exception:
            logger.debug("set_track_match: Tidal match lookup failed for %r", query, exc_info=True)
            continue
        if tidal_tracks:
            return tidal_tracks[0].model_dump()
    return None
