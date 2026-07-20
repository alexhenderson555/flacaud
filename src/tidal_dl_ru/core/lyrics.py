from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Callable, Optional

import httpx
import syncedlyrics

from tidal_dl_ru.core.models import Track

logger = logging.getLogger(__name__)

_LRCLIB_BASE = "https://lrclib.net/api"
_LRC_CACHE: dict[str, tuple[float, Optional[str]]] = {}
_CACHE_TTL_S = 3600
_DISK_CACHE_DIR = Path(os.environ.get("TIDALDLRU_LYRICS_CACHE", tempfile.gettempdir())) / "tidal_lyrics_v1"
_DISK_CACHE_TTL_S = 7 * 86400
_SYNCED_TIMEOUT_S = 12.0
_LYRICS_RACE_TIMEOUT_S = 18.0
_LRCLIB_TIMEOUT_S = 12.0
_LRCLIB_PARALLEL_TIMEOUT_S = 14.0
_LYRICS_PROVIDERS = ["Lrclib", "Megalobiz", "NetEase", "Musixmatch", "Genius"]
# NetEase is often fastest; Lrclib via syncedlyrics is a backup to the httpx LRCLIB race.
_FAST_LYRICS_PROVIDERS = ["NetEase", "Lrclib", "Megalobiz"]
_PLAIN_LYRICS_PROVIDERS = ["Genius", "Lrclib"]
_PLAIN_RACE_TIMEOUT_S = 14.0
_FEAT_SUFFIX_RE = re.compile(
    r"\s*[\(\[](?:feat\.?|ft\.?|featuring)[^\)\]]+[\)\]]",
    re.IGNORECASE,
)

# Some providers (often NetEase) embed credits and section labels as timed LRC lines.
_CREDITS_LINE_RE = re.compile(
    r"^(?:"
    r"producer|produced by|composer|composed by|lyrics by|lyricist|arranged by|"
    r"作词|作詞|作曲|编曲|編曲|制作人|プロデューサー|作詞作曲|編曲者|"
    r")\s*[:：]",
    re.IGNORECASE,
)
# Standalone section markers: "verse:", "[Pre-Chorus]", "bridge 2", etc.
_SECTION_LINE_RE = re.compile(
    r"^\[?\s*(?:"
    r"verse|pre(?:-?\s*chorus)?|chorus|bridge|intro|outro|hook|refrain|interlude|"
    r"主歌|副歌|桥段|前奏|尾奏|间奏|間奏"
    r")\s*(?:\d+|[ivx]+)?\s*\]?\s*[:：]?\s*$",
    re.IGNORECASE,
)

# --- Genius plain-text scrape artifacts (unsynced lyrics) -------------------
# "19 Contributors", "Translations", "<Song> Lyrics" header, "[Couplet 1 : X]"
# / "[Paroles de …]" section markers, and the "…Embed"/"You might also like" tail.
_GENIUS_CONTRIB_RE = re.compile(r"^\d+\s+contributors?\b", re.IGNORECASE)
_GENIUS_LYRICS_HEADER_RE = re.compile(r"^(?P<title>.+?)\s+lyrics$", re.IGNORECASE)
_GENIUS_FOOTER_RE = re.compile(
    r"(you might also like|^\d*embed$|get tickets as low as|^see .+ live$|^translations?$)",
    re.IGNORECASE,
)
_BRACKET_ONLY_RE = re.compile(r"^\s*[\[(][^\]\)]*[\])]\s*$")


def _norm_title_for_match(value: str) -> str:
    # Drop feat./version parens and punctuation for a lenient title comparison.
    v = _FEAT_SUFFIX_RE.sub("", value or "")
    v = re.sub(r"[\(\[].*?[\)\]]", "", v)
    v = re.sub(r"[^0-9a-zA-Zа-яА-ЯёЁ ]+", " ", v)
    return " ".join(v.lower().split())


def _title_roughly_matches(a: str, b: str) -> bool:
    na, nb = _norm_title_for_match(a), _norm_title_for_match(b)
    if not na or not nb:
        return True  # can't tell — don't reject
    if na in nb or nb in na:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= 0.5


def clean_plain_lyrics(text: str, expected_title: Optional[str] = None, expected_artist: Optional[str] = None) -> Optional[str]:
    """Strip Genius scrape cruft from unsynced lyrics.

    Returns cleaned text, or None when the Genius "<Song> Lyrics" header names a
    clearly different song than `expected_title` — i.e. a wrong-track hit (a loose
    match on the artist name), which should show nothing rather than another song.
    """
    if not text:
        return None
    out: list[str] = []
    for raw in text.splitlines():
        s = raw.strip()
        if not s:
            continue
        if _GENIUS_CONTRIB_RE.match(s) or _GENIUS_FOOTER_RE.search(s):
            continue
        header = _GENIUS_LYRICS_HEADER_RE.match(s)
        if header and len(s) <= 120:
            if expected_title:
                header_title = header.group("title")
                na = _norm_title_for_match(header_title)
                nt = _norm_title_for_match(expected_title)
                if nt not in na:
                    return None  # wrong title
                if expected_artist:
                    n_art = _norm_title_for_match(expected_artist)
                    # If header has a dash (Artist - Title) and artist doesn't match, reject.
                    if n_art and n_art not in na and ("-" in header_title or "–" in header_title):
                        return None
            continue  # drop the "<Song> Lyrics" header line
        if _BRACKET_ONLY_RE.match(s):
            continue  # [Couplet 1 : X] / [Paroles de …] / [Chorus] section markers
        out.append(s)
    cleaned = "\n".join(out).strip()
    return cleaned or None


def _cleanup_lyrics_lines(lines: list[dict]) -> list[dict]:
    if not lines:
        return lines

    out: list[dict] = []
    for idx, line in enumerate(lines):
        try:
            t = float(line.get("time", 0.0) or 0.0)
        except Exception:
            t = 0.0
        text = (line.get("text") or "").strip()
        if not text:
            continue

        if _SECTION_LINE_RE.match(text):
            continue

        is_early = idx < 6 or t <= 6.0
        looks_like_credits = bool(_CREDITS_LINE_RE.match(text))
        looks_like_credit_names = (
            is_early
            and (":" in text or "：" in text)
            and ("/" in text or "," in text)
            and len(text) >= 18
        )
        if is_early and (looks_like_credits or looks_like_credit_names):
            continue
        out.append({"time": t, "text": text})

    return out


def _timing_looks_suspicious(lines: list[dict], duration: Optional[int]) -> bool:
    if not lines or not duration or duration <= 0:
        return False
    try:
        end_t = max(float(ln.get("time", 0.0) or 0.0) for ln in lines)
    except Exception:
        return False
    # Wrong-track hits often have timings far shorter/longer than the real track.
    if end_t < (duration * 0.72) or end_t > (duration * 1.35):
        return True
    # Very sparse timed lines for long tracks are often wrong-track matches too.
    if duration >= 150 and len(lines) <= 4 and end_t < (duration * 0.82):
        return True
    return False


def _cache_key(
    *,
    artist: str,
    title: str,
    album: Optional[str],
    duration: Optional[int],
    isrc: Optional[str],
) -> str:
    if isrc:
        return f"isrc:{isrc.upper()}"
    return "|".join(
        [
            artist.strip().lower(),
            title.strip().lower(),
            (album or "").strip().lower(),
            str(duration or ""),
        ]
    )


def display_title(title: str, version: Optional[str] = None) -> str:
    if not version:
        return title
    v = version.strip()
    if not v or v.lower() in title.lower():
        return title
    return f"{title} ({v})"


def parse_lrc_lines(lrc: str) -> list[dict]:
    lines: list[dict] = []
    for line in lrc.split("\n"):
        if not line.startswith("[") or "]" not in line:
            continue
        time_str = line[1 : line.find("]")]
        text = line[line.find("]") + 1 :].strip()
        if not text:
            continue
        try:
            if ":" not in time_str:
                continue
            parts = time_str.split(":")
            if len(parts) == 3:
                seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            else:
                m, s = parts[0], parts[1]
                seconds = int(m) * 60 + float(s)
            lines.append({"time": seconds, "text": text})
        except (ValueError, TypeError):
            continue
    return lines


def _get_cached(key: str) -> Optional[str]:
    hit = _LRC_CACHE.get(key)
    if not hit:
        return None
    ts, lrc = hit
    if time.monotonic() - ts > _CACHE_TTL_S:
        _LRC_CACHE.pop(key, None)
        return None
    return lrc


def _set_cached(key: str, lrc: Optional[str]) -> None:
    _LRC_CACHE[key] = (time.monotonic(), lrc)
    _save_disk_cache(key, lrc)


def _disk_cache_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:40]
    return _DISK_CACHE_DIR / f"{digest}.json"


def _read_disk_cache(key: str) -> tuple[bool, Optional[str]]:
    """Return (hit, lrc_text). hit=True with lrc=None means cached negative (no lyrics)."""
    path = _disk_cache_path(key)
    if not path.is_file():
        return False, None
    try:
        if time.time() - path.stat().st_mtime > _DISK_CACHE_TTL_S:
            path.unlink(missing_ok=True)
            return False, None
        data = json.loads(path.read_text(encoding="utf-8"))
        if "lrc" not in data:
            return False, None
        text = data["lrc"]
        return True, (text if text else None)
    except Exception:
        path.unlink(missing_ok=True)
        return False, None


def _save_disk_cache(key: str, lrc: Optional[str]) -> None:
    try:
        _DISK_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _disk_cache_path(key).write_text(
            json.dumps({"lrc": lrc or ""}),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.debug("lyrics disk cache write failed: %s", exc)


def _lrclib_duration_delta(item: dict, duration: Optional[int]) -> Optional[int]:
    if not duration or duration <= 0:
        return None
    raw = item.get("duration")
    if raw is None:
        return None
    try:
        return abs(int(raw) - int(duration))
    except (TypeError, ValueError):
        return None


def _lrclib_max_duration_delta(duration: int) -> int:
    return max(12, int(duration * 0.08))


def _lrclib_pick_best_synced(data: object, duration: Optional[int] = None) -> Optional[str]:
    items: list[dict] = []
    if isinstance(data, list):
        items = [x for x in data if isinstance(x, dict)]
    elif isinstance(data, dict):
        items = [data]

    candidates: list[tuple[int, str]] = []
    for item in items:
        synced = item.get("syncedLyrics")
        if not synced or not str(synced).strip():
            continue
        delta = _lrclib_duration_delta(item, duration)
        rank = delta if delta is not None else 10_000
        candidates.append((rank, str(synced)))

    if not candidates:
        return None

    candidates.sort(key=lambda pair: pair[0])
    best_rank, best_lrc = candidates[0]
    if duration and duration > 0 and best_rank > _lrclib_max_duration_delta(duration):
        return None
    return best_lrc


def _lrclib_synced(client: httpx.Client, path: str, params: dict | None = None, *, duration: Optional[int] = None) -> Optional[str]:
    try:
        r = client.get(f"{_LRCLIB_BASE}/{path}", params=params, timeout=_LRCLIB_TIMEOUT_S)
        if r.status_code != 200:
            return None
        return _lrclib_pick_best_synced(r.json(), duration)
    except Exception as exc:
        logger.debug("LRCLIB lookup failed (%s): %s", path, exc)
        return None


def _lrclib_search(client: httpx.Client, artist: str, title: str, duration: Optional[int] = None) -> Optional[str]:
    try:
        r = client.get(
            f"{_LRCLIB_BASE}/search",
            params={"artist_name": artist, "track_name": title},
            timeout=_LRCLIB_TIMEOUT_S,
        )
        if r.status_code != 200:
            return None
        return _lrclib_pick_best_synced(r.json(), duration)
    except Exception as exc:
        logger.debug("LRCLIB search failed: %s", exc)
        return None


def _lrclib_pick_field(data: object, field: str) -> Optional[str]:
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            text = item.get(field)
            if text and str(text).strip():
                return str(text)
        return None
    if isinstance(data, dict):
        text = data.get(field)
        return str(text) if text and str(text).strip() else None
    return None


def _lrclib_field(client: httpx.Client, path: str, field: str, params: dict | None = None) -> Optional[str]:
    try:
        r = client.get(f"{_LRCLIB_BASE}/{path}", params=params, timeout=_LRCLIB_TIMEOUT_S)
        if r.status_code != 200:
            return None
        return _lrclib_pick_field(r.json(), field)
    except Exception as exc:
        logger.debug("LRCLIB %s lookup failed (%s): %s", field, path, exc)
        return None


def _lrclib_plain_search(client: httpx.Client, artist: str, title: str) -> Optional[str]:
    return _lrclib_field(
        client,
        "search",
        "plainLyrics",
        {"artist_name": artist, "track_name": title},
    )


def _lrclib_plain_lookup(
    artist: str,
    title: str,
    album: Optional[str],
    duration: Optional[int],
    isrc: Optional[str],
) -> Optional[str]:
    """LRCLIB plain (unsynced) lyrics via ISRC / metadata / search."""
    if not isrc and not (artist and title):
        return None

    def _isrc_hit() -> Optional[str]:
        if not isrc:
            return None
        with httpx.Client() as client:
            return _lrclib_field(client, f"get/isrc/{isrc.strip()}", "plainLyrics")

    def _meta_hit() -> Optional[str]:
        if not (artist and title):
            return None
        params: dict = {"artist_name": artist, "track_name": title}
        if album:
            params["album_name"] = album
        if duration:
            params["duration"] = int(duration)
        with httpx.Client() as client:
            return _lrclib_field(client, "get", "plainLyrics", params)

    def _search_hit() -> Optional[str]:
        if not (artist and title):
            return None
        with httpx.Client() as client:
            return _lrclib_plain_search(client, artist, title)

    jobs = []
    pool = ThreadPoolExecutor(max_workers=3)
    try:
        if isrc:
            jobs.append(pool.submit(_isrc_hit))
        if artist and title:
            jobs.append(pool.submit(_meta_hit))
            jobs.append(pool.submit(_search_hit))
        try:
            for fut in as_completed(jobs, timeout=_LRCLIB_PARALLEL_TIMEOUT_S):
                try:
                    hit = fut.result()
                except Exception:
                    continue
                if hit:
                    for pending in jobs:
                        pending.cancel()
                    return hit
        except FuturesTimeout:
            logger.debug("LRCLIB plain lookup timeout for %s - %s", artist, title)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return None


def _plain_lyrics_race(queries: list[str]) -> Optional[str]:
    """Try syncedlyrics unsynced providers in parallel; first non-empty hit wins."""
    primary = queries[0] if queries else ""
    if not primary.strip():
        return None

    tasks = []
    for prov in _PLAIN_LYRICS_PROVIDERS:
        tasks.append(
            (prov, lambda p=prov, qq=primary: _syncedlyrics_provider(qq, p, synced_only=False)),
        )

    pool = ThreadPoolExecutor(max_workers=min(6, len(tasks)))
    try:
        futures: dict[Any, str] = {pool.submit(fn): name for name, fn in tasks}
        try:
            for fut in as_completed(futures, timeout=_PLAIN_RACE_TIMEOUT_S):
                try:
                    hit = fut.result()
                except Exception:
                    continue
                if hit and str(hit).strip():
                    for pending in futures:
                        pending.cancel()
                    return str(hit)
        except FuturesTimeout:
            logger.debug("plain lyrics race timeout for %r", primary)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return None


def _plain_lyrics_lookup(
    *,
    artist: str,
    title: str,
    album: Optional[str] = None,
    duration: Optional[int] = None,
    isrc: Optional[str] = None,
    query: Optional[str] = None,
) -> Optional[str]:
    """Unsynced lyrics when timed LRC is unavailable."""
    plain = _lrclib_plain_lookup(artist, title, album, duration, isrc)
    if plain:
        return plain

    queries: list[str] = []
    if query and query.strip():
        queries.append(query.strip())
    queries.extend(_search_queries(artist, title, album))
    seen: set[str] = set()
    deduped: list[str] = []
    for q in queries:
        q = q.strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            deduped.append(q)

    for q in deduped[:2]:
        hit = _plain_lyrics_race([q])
        if hit:
            return hit
    return None


def _syncedlyrics_search(query: str, providers: list[str], *, synced_only: bool = True) -> Optional[str]:
    def _run() -> Optional[str]:
        return syncedlyrics.search(query, synced_only=synced_only, providers=providers)

    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(_run)
    try:
        return future.result(timeout=_SYNCED_TIMEOUT_S)
    except (FuturesTimeout, Exception) as exc:
        logger.debug("syncedlyrics timeout/error for %r: %s", query, exc)
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _syncedlyrics_provider(query: str, provider: str, *, synced_only: bool) -> Optional[str]:
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(
        syncedlyrics.search,
        query,
        synced_only=synced_only,
        providers=[provider],
    )
    try:
        return future.result(timeout=_SYNCED_TIMEOUT_S)
    except (FuturesTimeout, Exception) as exc:
        logger.debug("syncedlyrics %s for %r: %s", provider, query, exc)
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _lrclib_lookup(
    artist: str,
    title: str,
    album: Optional[str],
    duration: Optional[int],
    isrc: Optional[str],
) -> Optional[str]:
    """LRCLIB ISRC / metadata / search in parallel — first hit wins."""
    if not isrc and not (artist and title):
        return None

    def _isrc_hit() -> Optional[str]:
        if not isrc:
            return None
        with httpx.Client() as client:
            return _lrclib_synced(client, f"get/isrc/{isrc.strip()}", duration=duration)

    def _meta_hit() -> Optional[str]:
        if not (artist and title):
            return None
        params: dict = {"artist_name": artist, "track_name": title}
        if album:
            params["album_name"] = album
        if duration:
            params["duration"] = int(duration)
        with httpx.Client() as client:
            return _lrclib_synced(client, "get", params, duration=duration)

    def _search_hit() -> Optional[str]:
        if not (artist and title):
            return None
        with httpx.Client() as client:
            return _lrclib_search(client, artist, title, duration)

    jobs = []
    pool = ThreadPoolExecutor(max_workers=3)
    try:
        if isrc:
            jobs.append(pool.submit(_isrc_hit))
        if artist and title:
            jobs.append(pool.submit(_meta_hit))
            jobs.append(pool.submit(_search_hit))
        try:
            for fut in as_completed(jobs, timeout=_LRCLIB_PARALLEL_TIMEOUT_S):
                try:
                    hit = fut.result()
                except Exception:
                    continue
                if hit:
                    for pending in jobs:
                        pending.cancel()
                    return hit
        except FuturesTimeout:
            logger.debug("LRCLIB parallel lookup timeout for %s - %s", artist, title)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return None


def _race_lyrics_sources(
    artist: str,
    title: str,
    album: Optional[str],
    duration: Optional[int],
    isrc: Optional[str],
    queries: list[str],
) -> tuple[Optional[str], bool]:
    """LRCLIB + fast syncedlyrics providers in parallel; first hit wins.

    Returns (lrc_text, timed_out). Empty results after a timeout are not cached
  so the next request can retry slow providers (LRCLIB often needs 10–15s).
    """
    tasks: list[tuple[str, Callable[[], Any]]] = [
        ("lrclib", lambda: _lrclib_lookup(artist, title, album, duration, isrc)),
    ]
    primary_query = queries[0] if queries else f"{artist} - {title}"
    for prov in _FAST_LYRICS_PROVIDERS:
        tasks.append(
            (f"{prov}:{primary_query}", lambda p=prov, qq=primary_query: _syncedlyrics_provider(qq, p, synced_only=True)),  # type: ignore[misc]
        )

    pool = ThreadPoolExecutor(max_workers=min(8, len(tasks)))
    try:
        futures: dict[Any, str] = {pool.submit(fn): name for name, fn in tasks}
        try:
            for fut in as_completed(futures, timeout=_LYRICS_RACE_TIMEOUT_S):
                try:
                    hit = fut.result()
                except Exception:
                    continue
                if hit:
                    for pending in futures:
                        pending.cancel()
                    return hit, False
        except FuturesTimeout:
            logger.debug("lyrics race timeout for %s - %s", artist, title)
            return None, True
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return None, False


def _plain_lyrics_to_lines(text: str) -> list[dict]:
    lines: list[dict] = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped:
            lines.append({"time": 0.0, "text": stripped})
    return lines


def _title_variants(title: str) -> list[str]:
    base = title.strip()
    if not base:
        return []
    variants = [base]
    stripped = _FEAT_SUFFIX_RE.sub("", base).strip()
    if stripped and stripped.lower() != base.lower():
        variants.append(stripped)
    return variants


def _artist_variants(artist: str) -> list[str]:
    raw = artist.strip()
    if not raw:
        return []
    variants = [raw]
    if "," in raw:
        primary = raw.split(",")[0].strip()
        if primary:
            variants.append(primary)
    if " & " in raw:
        variants.append(raw.split(" & ")[0].strip())
    seen: set[str] = set()
    out: list[str] = []
    for a in variants:
        if a and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out


def _search_queries(artist: str, title: str, album: Optional[str]) -> list[str]:
    queries: list[str] = []
    for a in _artist_variants(artist):
        for t in _title_variants(title):
            queries.append(f"{a} - {t}")
            queries.append(f"{a} {t}")
    if artist and album:
        queries.append(f"{artist} {album}")
    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        q = q.strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
    return out


def fetch_synced_lrc_text(
    *,
    artist: str,
    title: str,
    album: Optional[str] = None,
    duration: Optional[int] = None,
    isrc: Optional[str] = None,
    version: Optional[str] = None,
    providers: Optional[list[str]] = None,
) -> Optional[str]:
    """Return synced LRC text for a track, or None if not found."""
    track_title = display_title(title, version)
    key = _cache_key(artist=artist, title=track_title, album=album, duration=duration, isrc=isrc)
    cached = _get_cached(key)
    if cached is not None:
        return cached or None

    disk_hit, disk_lrc = _read_disk_cache(key)
    if disk_hit:
        _set_cached(key, disk_lrc or "")
        return disk_lrc or None

    queries = _search_queries(artist, track_title, album)
    lrc, timed_out = _race_lyrics_sources(artist, track_title, album, duration, isrc, queries)

    if lrc:
        _set_cached(key, lrc)
        return lrc
    if not timed_out:
        _set_cached(key, "")
    return None


def fetch_synced_lrc(track: Track, providers: Optional[list[str]] = None) -> Optional[str]:
    """Return synced LRC text for a Track model (downloads / tagging)."""
    return fetch_synced_lrc_text(
        artist=track.primary_artist,
        title=track.title,
        album=track.album,
        duration=track.duration_s,
        isrc=track.isrc,
        version=track.version,
        providers=providers,
    )


def fetch_lyrics_lines(
    *,
    artist: str,
    title: str,
    album: Optional[str] = None,
    duration: Optional[int] = None,
    isrc: Optional[str] = None,
    version: Optional[str] = None,
    query: Optional[str] = None,
) -> list[dict]:
    """Return parsed lyric lines for the player UI."""
    track_title = display_title(title, version)
    lrc = fetch_synced_lrc_text(
        artist=artist,
        title=title,
        album=album,
        duration=duration,
        isrc=isrc,
        version=version,
    )
    if not lrc and query:
        lrc = _syncedlyrics_search(query, _FAST_LYRICS_PROVIDERS, synced_only=True)
    if lrc:
        parsed = parse_lrc_lines(lrc)
        if parsed:
            cleaned = _cleanup_lyrics_lines(parsed)
            if _timing_looks_suspicious(cleaned, duration):
                try:
                    lrclib = _lrclib_lookup(artist, track_title, album, duration, isrc)
                    if lrclib and lrclib != lrc:
                        parsed2 = parse_lrc_lines(lrclib)
                        if parsed2:
                            cleaned2 = _cleanup_lyrics_lines(parsed2)
                            if not _timing_looks_suspicious(cleaned2, duration):
                                return cleaned2
                except Exception:
                    pass
                # Fall through to plain lyrics instead of returning empty.
            else:
                return cleaned
        else:
            cleaned_plain = clean_plain_lyrics(lrc, track_title, expected_artist=artist)
            if cleaned_plain:
                plain_from_lrc = _plain_lyrics_to_lines(cleaned_plain)
                if plain_from_lrc:
                    return plain_from_lrc

    plain = _plain_lyrics_lookup(
        artist=artist,
        title=track_title,
        album=album,
        duration=duration,
        isrc=isrc,
        query=query,
    )
    if plain:
        cleaned_plain = clean_plain_lyrics(plain, track_title, expected_artist=artist)
        if cleaned_plain:
            lines = _plain_lyrics_to_lines(cleaned_plain)
            if lines:
                return lines
    return []


def write_sidecar(lrc_text: str, audio_path: Path) -> Path:
    """Write `.lrc` sidecar next to the audio file. Return the sidecar path."""
    sidecar = audio_path.with_suffix(".lrc")
    sidecar.write_text(lrc_text, encoding="utf-8")
    return sidecar
