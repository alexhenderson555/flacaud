"""Search YouTube/SoundCloud for DJ sets, and fetch a single set's metadata.

No API keys required — uses yt-dlp's search extractors (ytsearch:/scsearch:) in
flat-extraction mode, which lists results without downloading anything.
"""

import logging
import re

logger = logging.getLogger(__name__)

_FLAT_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": True,
    "skip_download": True,
    "socket_timeout": 15,
}


def _entry_to_result(entry: dict, source: str) -> dict | None:
    url = entry.get("url") or entry.get("webpage_url") or entry.get("original_url")
    if not url:
        return None
    if source == "youtube" and entry.get("id") and not url.startswith("http"):
        url = f"https://www.youtube.com/watch?v={entry['id']}"
    thumbnails = entry.get("thumbnails") or []
    thumbnail = entry.get("thumbnail") or (thumbnails[-1]["url"] if thumbnails else None)
    return {
        "url": url,
        "title": entry.get("title") or "Untitled set",
        "channel": entry.get("channel") or entry.get("uploader") or "",
        "duration_seconds": int(entry.get("duration") or 0),
        "thumbnail": thumbnail,
        "source": source,
        "view_count": int(entry.get("view_count") or 0),
        # Only SoundCloud's flat search includes a real timestamp for free;
        # YouTube's flat search omits it (getting it there needs a full
        # per-video extraction, which risks the same per-IP rate-limiting we
        # already hit once this session on Tidal — not worth it for a search
        # results grid of 8-12 videos).
        "upload_timestamp": entry.get("timestamp"),
    }


def _search_one(query: str, prefix: str, source: str, limit: int) -> list[dict]:
    import yt_dlp

    results: list[dict] = []
    try:
        with yt_dlp.YoutubeDL(_FLAT_OPTS) as ydl:
            info = ydl.extract_info(f"{prefix}{limit}:{query}", download=False)
        entries = (info or {}).get("entries") or []
        for entry in entries:
            row = _entry_to_result(entry or {}, source)
            if row:
                results.append(row)
    except Exception:
        logger.debug("set_search: %s search failed for %r", source, query, exc_info=True)
    return results


# A regular track/single is at most a few minutes; a DJ set/mix runs long.
# Below this, it's very unlikely to be an actual set — filter it out rather
# than show individual tracks in a "search sets" grid.
MIN_SET_DURATION_SECONDS = 20 * 60


def search_sets(query: str, limit: int = 12) -> list[dict]:
    """Search YouTube + SoundCloud for DJ sets/mixes matching `query`."""
    query = (query or "").strip()
    if not query:
        return []
    # Overfetch since some results get filtered out by duration below.
    per_source = max(6, limit)
    yt = _search_one(query, "ytsearch", "youtube", per_source)
    sc = _search_one(query, "scsearch", "soundcloud", per_source)
    combined = [
        r for r in (yt + sc)
        if r["duration_seconds"] >= MIN_SET_DURATION_SECONDS
    ]
    return combined[:limit]


def fetch_set_info(url: str) -> dict:
    """Fetch a single set's title/description/duration without downloading audio."""
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 15,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title") or "",
        "description": info.get("description") or "",
        "duration_seconds": int(info.get("duration") or 0),
        "channel": info.get("channel") or info.get("uploader") or "",
        "thumbnail": info.get("thumbnail"),
    }


# Noise words stripped from a set's title before using it as a "find similar
# sets" search query — venue/event/date/quality tags that make the query too
# narrow to find anything else.
_NOISE_RE = re.compile(
    r"\b(dj\s*set|live\s*set|full\s*set|live\s*at|@|20\d{2}|hd|4k|full\s*hd|"
    r"official|video|audio|part\s*\d+|episode\s*\d+|ep\.?\s*\d+)\b",
    re.IGNORECASE,
)


# Splits a title like "Antdot | Tomorrowland Winter 2026" or "Antdot @ Club
# Vibe 2025" into its first segment — almost always the DJ/artist name,
# regardless of which festival/venue/channel actually uploaded the video.
_TITLE_SPLIT_RE = re.compile(r"\s*[|@:]\s*|\s+[-–]\s+")


def _artist_from_title(title: str) -> str:
    first = _TITLE_SPLIT_RE.split((title or "").strip(), maxsplit=1)[0].strip()
    # No separator at all (first == whole title) means this isn't reliably
    # an "Artist <sep> Event" title — too generic/long to use as a name.
    if first and len(first) < 60 and first.lower() != (title or "").strip().lower():
        return first
    return ""


def build_similar_query(title: str, channel: str) -> str:
    """Best-effort query to find sets by the SAME ARTIST/DJ (not just the
    same festival/venue — a big event's own upload channel, e.g.
    "Tomorrowland", is nearly always the channel but is not who's playing)."""
    artist = _artist_from_title(title)
    if artist:
        return f"{artist} dj set"
    if channel:
        return f"{channel} dj set"
    cleaned = _NOISE_RE.sub(" ", title or "")
    cleaned = re.sub(r"[\[\](){}|:,-]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split(" ")[:6]
    query = " ".join(words).strip()
    return f"{query} dj set" if query else "dj set"
