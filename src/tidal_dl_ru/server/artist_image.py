"""Artist portraits — Wikipedia (open web) + Deezer/iTunes, all free, no API keys."""

from __future__ import annotations

import logging
import os
import re
import unicodedata

import httpx

from tidal_dl_ru.server.artist_image_cache import artist_image_cache_get, artist_image_cache_set

logger = logging.getLogger(__name__)

_DEEZER_SEARCH = "https://api.deezer.com/search/artist"
_ITUNES_SEARCH = "https://itunes.apple.com/search"
_WIKI_API = "https://{lang}.wikipedia.org/w/api.php"
_WIKI_TITLE_SUFFIX = re.compile(
    r"\s*\((band|musical group|musician|rapper|singer|dj|duo|group|artist|record producer)\)$",
    re.I,
)
_HTTP_HEADERS = {
    "User-Agent": os.environ.get(
        "TIDALDLRU_WIKI_USER_AGENT",
        "FlacAud/1.0 (https://flacaud.ru; artist portraits)",
    ),
}


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip())


def _fold_name(name: str) -> str:
    folded = unicodedata.normalize("NFKD", _normalize_name(name))
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = folded.lower()
    if folded.startswith("the "):
        folded = folded[4:]
    return folded


def names_match(wanted: str, candidate: str) -> bool:
    a = _fold_name(wanted)
    b = _fold_name(candidate)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def _wiki_title_matches(wanted: str, title: str) -> bool:
    base = _WIKI_TITLE_SUFFIX.sub("", title or "").strip()
    return names_match(wanted, base) or names_match(wanted, title)


def _wiki_langs_for_name(name: str) -> tuple[str, ...]:
    if re.search(r"[\u0400-\u04ff]", name):
        return ("ru", "en")
    return ("en", "ru")


def _guess_picture_source(url: str) -> str:
    host = (url or "").lower()
    if "wikimedia.org" in host or "wikipedia.org" in host:
        return "wikimedia"
    if "dzcdn.net" in host:
        return "deezer"
    if "mzstatic.com" in host:
        return "itunes"
    if "tidal" in host:
        return "tidal"
    return "external"


def _wiki_search_titles(http: httpx.Client, lang: str, name: str) -> list[str]:
    titles: list[str] = []
    seen: set[str] = set()
    for query in (f"{name} musician", f"{name} band", name):
        r = http.get(
            _WIKI_API.format(lang=lang),
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 6,
                "format": "json",
            },
        )
        if r.status_code != 200:
            continue
        for hit in (r.json() or {}).get("query", {}).get("search") or []:
            title = (hit.get("title") or "").strip()
            if title and title not in seen:
                seen.add(title)
                titles.append(title)
    return titles


def _wiki_page_image(http: httpx.Client, lang: str, title: str) -> str | None:
    r = http.get(
        _WIKI_API.format(lang=lang),
        params={
            "action": "query",
            "titles": title,
            "prop": "pageimages",
            "pithumbsize": 800,
            "piprop": "thumbnail|original",
            "format": "json",
        },
    )
    if r.status_code != 200:
        return None
    pages = (r.json() or {}).get("query", {}).get("pages") or {}
    for page in pages.values():
        if page.get("missing") or page.get("pageid", -1) < 0:
            continue
        original = (page.get("original") or {}).get("source")
        thumb = (page.get("thumbnail") or {}).get("source")
        url = original or thumb
        if url and str(url).startswith("http"):
            return str(url).strip()
    return None


def fetch_wikimedia_artist_image(artist_name: str) -> str | None:
    """Portrait from Wikipedia / Wikimedia Commons — no API key."""
    name = _normalize_name(artist_name)
    if not name:
        return None
    try:
        with httpx.Client(timeout=14.0, headers=_HTTP_HEADERS) as http:
            for lang in _wiki_langs_for_name(name):
                for title in _wiki_search_titles(http, lang, name):
                    if not _wiki_title_matches(name, title):
                        continue
                    url = _wiki_page_image(http, lang, title)
                    if url:
                        return url
    except Exception as exc:
        logger.info("Wikimedia artist image failed for %r: %s", name, exc)
    return None


def fetch_deezer_artist_image(artist_name: str) -> str | None:
    name = _normalize_name(artist_name)
    if not name:
        return None
    try:
        with httpx.Client(timeout=12.0) as http:
            r = http.get(_DEEZER_SEARCH, params={"q": name, "limit": 10})
            if r.status_code != 200:
                logger.info("Deezer artist search HTTP %s for %r", r.status_code, name)
                return None
            for item in (r.json() or {}).get("data") or []:
                if not names_match(name, item.get("name") or ""):
                    continue
                url = (
                    item.get("picture_xl")
                    or item.get("picture_big")
                    or item.get("picture_medium")
                    or item.get("picture")
                )
                if url and str(url).startswith("http"):
                    return str(url).strip()
    except Exception as exc:
        logger.info("Deezer artist image failed for %r: %s", name, exc)
    return None


def fetch_itunes_artist_image(artist_name: str) -> str | None:
    name = _normalize_name(artist_name)
    if not name:
        return None
    try:
        with httpx.Client(timeout=12.0) as http:
            r = http.get(
                _ITUNES_SEARCH,
                params={"term": name, "entity": "musicArtist", "limit": 10},
            )
            if r.status_code != 200:
                logger.info("iTunes artist search HTTP %s for %r", r.status_code, name)
                return None
            for item in (r.json() or {}).get("results") or []:
                if not names_match(name, item.get("artistName") or ""):
                    continue
                url = item.get("artworkUrl100") or item.get("artworkUrl60")
                if not url:
                    continue
                return re.sub(r"\d+x\d+bb", "600x600bb", str(url).strip())
    except Exception as exc:
        logger.info("iTunes artist image failed for %r: %s", name, exc)
    return None



def resolve_artist_picture_url(
    artist_name: str,
    *,
    artist_id: str | None = None,
    tidal_picture_id: str | None = None,
    tidal_cover_url_fn=None,
) -> tuple[str | None, str]:
    """Wikimedia → Deezer → iTunes → Tidal. Cached per artist id (7 days)."""
    if artist_id:
        cached = artist_image_cache_get(artist_id)
        if cached is not False:
            if cached:
                cached_str: str = str(cached)
                return cached_str, _guess_picture_source(cached_str)
            if tidal_picture_id and tidal_cover_url_fn:
                return tidal_cover_url_fn(tidal_picture_id, size=640), "tidal"
            return None, "none"

    for source_id, fetcher_name in (
        ("wikimedia", "fetch_wikimedia_artist_image"),
        ("deezer", "fetch_deezer_artist_image"),
        ("itunes", "fetch_itunes_artist_image"),
    ):
        fetcher = globals()[fetcher_name]
        url = fetcher(artist_name)
        if url:
            if artist_id:
                artist_image_cache_set(artist_id, url)
            return url, source_id

    if tidal_picture_id and tidal_cover_url_fn:
        url = tidal_cover_url_fn(tidal_picture_id, size=640)
        if artist_id:
            artist_image_cache_set(artist_id, url)
        return url, "tidal"

    if artist_id:
        artist_image_cache_set(artist_id, None)
    return None, "none"
