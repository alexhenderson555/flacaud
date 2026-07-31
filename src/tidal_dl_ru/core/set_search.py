"""Search YouTube/SoundCloud for DJ sets, and fetch a single set's metadata.

No API keys required — uses yt-dlp's search extractors (ytsearch:/scsearch:) in
flat-extraction mode, which lists results without downloading anything.
"""

import logging
import re
import time

logger = logging.getLogger(__name__)

_FLAT_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": True,
    "skip_download": True,
    "socket_timeout": 15,
}


def _entry_to_result(entry: dict, source: str) -> dict | None:
    # webpage_url first, NOT url: for SoundCloud's flat-extraction search
    # results, entry["url"] is the internal API resource form
    # (https://api.soundcloud.com/tracks/soundcloud:tracks:ID) -- not a
    # fetchable page. It resolves fine for oEmbed/metadata previews but 401s
    # or 429s every single time yt-dlp tries to actually download/analyze it
    # later. entry["webpage_url"] is the real public soundcloud.com page.
    # YouTube's flat entries have webpage_url=None and a already-correct
    # url, so this ordering is safe for both sources.
    url = entry.get("webpage_url") or entry.get("original_url") or entry.get("url")
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


def _relevance_score(row: dict, rank: int) -> float:
    """Rank within its own platform is the primary relevance signal — each
    platform's search already orders by its own idea of relevance, so this
    is what actually matters, NOT which platform a result came from.

    A modest recency nudge is layered on top (weighted, not dominant — a
    5-year-old top-rank result still beats a barely-relevant new one). Only
    SoundCloud's flat search exposes a real upload timestamp for free;
    YouTube results get a neutral factor rather than being penalized for
    lacking the signal.
    """
    rank_score = 1.0 / (rank + 1)
    ts = row.get("upload_timestamp")
    if ts:
        age_days = max(0.0, (time.time() - ts) / 86400)
        recency = max(0.5, 1.0 - age_days / 1460)  # floors out after ~4 years
    else:
        recency = 0.85
    return rank_score * (0.7 + 0.3 * recency)


def search_sets(
    query: str,
    limit: int = 12,
    sources: tuple[str, ...] = ("youtube", "soundcloud"),
) -> list[dict]:
    """Search YouTube + SoundCloud for DJ sets/mixes matching `query`,
    blended by relevance (not "all of YouTube's results, then SoundCloud's").

    `sources` restricts which platform(s) to query -- e.g. the "uploaded
    within" filter only has real data for SoundCloud (YouTube's flat search
    doesn't expose an upload timestamp), so a caller filtering by date should
    search SoundCloud alone with a bigger limit rather than split it with
    YouTube results that will mostly get filtered out client-side anyway.
    """
    query = (query or "").strip()
    if not query:
        return []
    # Overfetch since some results get filtered out by duration below. A
    # single-source search has no other platform to fill the quota, so it
    # needs a bigger overfetch to leave enough candidates for any additional
    # client-side filtering on top. This matters most for the "uploaded
    # within" date filter: SoundCloud's search API has no server-side date
    # filter at all (yt-dlp's scsearch only forwards the query text), so the
    # ONLY way to reliably surface anything from e.g. the last week is to
    # pull a much bigger pool from the relevance-ranked results and pick the
    # recent ones out of that -- 200 is yt-dlp's own per-search cap.
    per_source = max(6, limit) if len(sources) > 1 else min(200, max(150, limit * 4))
    yt = _search_one(query, "ytsearch", "youtube", per_source) if "youtube" in sources else []
    sc = _search_one(query, "scsearch", "soundcloud", per_source) if "soundcloud" in sources else []

    scored = [
        (_relevance_score(row, rank), row)
        for rank, row in enumerate(yt)
        if row["duration_seconds"] >= MIN_SET_DURATION_SECONDS
    ] + [
        (_relevance_score(row, rank), row)
        for rank, row in enumerate(sc)
        if row["duration_seconds"] >= MIN_SET_DURATION_SECONDS
    ]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [row for _score, row in scored[:limit]]


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


def _cleaned_title_fallback_query(title: str) -> str:
    cleaned = _NOISE_RE.sub(" ", title or "")
    cleaned = re.sub(r"[\[\](){}|:,-]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split(" ")[:6]
    query = " ".join(words).strip()
    return f"{query} dj set" if query else "dj set"


# Longer/more specific phrases must be checked before their generic substrings
# ("afro house" before "house") so the more precise genre wins.
_GENRE_KEYWORDS = [
    "afro house", "tech house", "deep house", "melodic house", "funky house",
    "progressive house", "melodic techno", "minimal techno", "hard techno",
    "drum and bass", "dnb", "psytrance", "dubstep", "trance", "techno",
    "house", "disco", "garage", "trap", "electro",
]


def _genre_from_title(title: str) -> str:
    low = (title or "").lower()
    for genre in _GENRE_KEYWORDS:
        if genre in low:
            return genre
    return ""


def build_similar_queries(title: str, channel: str) -> list[str]:
    """Radio-style blend of queries for "similar sets" — same artist, same
    genre/style, and the same event/channel — rather than one narrow query,
    so the result is a mix like track radio, not just "more from this DJ"."""
    artist = _artist_from_title(title)
    genre = _genre_from_title(title)
    queries = []
    if artist:
        queries.append(f"{artist} dj set")
    if genre:
        queries.append(f"{genre} dj set")
    if channel and channel.strip().lower() != artist.strip().lower():
        queries.append(f"{channel} dj set")
    if not queries:
        queries.append(_cleaned_title_fallback_query(title))

    seen: set[str] = set()
    deduped = []
    for q in queries:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)
    return deduped[:3]
