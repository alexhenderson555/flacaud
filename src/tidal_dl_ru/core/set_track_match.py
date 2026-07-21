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


async def match_tidal_track(artist: str, title: str) -> dict | None:
    """Search Tidal for the best match; None if no provider or no hit."""
    provider = get_provider_by_name("tidal")
    if not provider:
        return None
    query = f"{artist} {clean_title_for_query(title)}".strip()
    if not query:
        return None
    try:
        tidal_tracks = await asyncio.to_thread(provider.search, query, 1)
        if tidal_tracks:
            return tidal_tracks[0].model_dump()
    except Exception:
        logger.debug("set_track_match: Tidal match lookup failed", exc_info=True)
    return None
