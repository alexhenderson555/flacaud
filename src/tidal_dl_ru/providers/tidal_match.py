"""Match external catalog metadata to Tidal tracks for library transfer.

Pipeline (industry-style, cf. FreeYourMusic / Soundiiz / Navidrome):
  1. ISRC exact lookup with verification + duration check
  2. Multi-query text search (artist+title, title+artist, title+album)
  3. Composite score: title, artist, album, duration, version alignment
"""

from __future__ import annotations

import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from typing import Callable, Optional

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.match_types import MatchDetail, UserMatchRule
from tidal_dl_ru.server.transfer_logging import log_match_result

_DEFAULT_MATCH_WORKERS = 10
_MIN_MATCH_SCORE = float(os.environ.get("TIDALDLRU_TRANSFER_MIN_MATCH_SCORE", "0.55"))
_DURATION_TOLERANCE_S = 8
_HARD_DURATION_S = 5
_SEARCH_LIMIT_PER_QUERY = 12
_MAX_CANDIDATES = 30
ProgressCallback = Callable[[int, int, int], None]  # done, total, matched

_TITLE_NOISE_RE = re.compile(
    r"\s*[\(\[](official\s+video|official\s+audio|lyric\s+video|music\s+video|mv|hd|4k)[\)\]]\s*",
    re.I,
)
_VERSION_MARKERS = re.compile(
    r"\b(live|remix|rmx|karaoke|acoustic|sped\s*up|slowed|nightcore|instrumental|"
    r"cover|unplugged|demo|extended|edit|remake|rework|bootleg)\b",
    re.I,
)
_FEAT_RE = re.compile(r"\s+feat\.?\s+[^(\[]+", re.I)


def _tidal_provider():
    from tidal_dl_ru.core.router import get_provider_by_name

    return get_provider_by_name("tidal")


def _normalize_text(value: str) -> str:
    text = (value or "").lower().strip()
    text = _TITLE_NOISE_RE.sub(" ", text)
    text = _FEAT_RE.sub("", text)
    text = re.sub(r"[^a-z0-9а-яё\s]", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def _sequence_ratio(a: str, b: str) -> float:
    na, nb = _normalize_text(a), _normalize_text(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def _token_jaccard(a: str, b: str) -> float:
    ta = set(_normalize_text(a).split())
    tb = set(_normalize_text(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _text_similarity(a: str, b: str) -> float:
    return max(_sequence_ratio(a, b), _token_jaccard(a, b))


_GENERIC_TITLE_MAX_LEN = 14


def _is_generic_title(title: str) -> bool:
    norm = _normalize_text(title)
    if not norm:
        return False
    words = norm.split()
    return len(words) <= 1 and len(norm) <= _GENERIC_TITLE_MAX_LEN


def _has_version_marker(title: str) -> bool:
    return bool(_VERSION_MARKERS.search(title or ""))


def _artist_similarity(source_artists: list[str], candidate_artists: list[str]) -> float:
    if not source_artists or not candidate_artists:
        return 0.0
    best = 0.0
    for src in source_artists[:4]:
        src_norm = _normalize_text(src)
        if not src_norm:
            continue
        for artist in candidate_artists[:4]:
            best = max(best, _text_similarity(src_norm, artist))
    return best


def _album_similarity(source: Track, candidate: Track) -> float:
    if not source.album or not candidate.album:
        return 0.0
    return _text_similarity(source.album, candidate.album)


def _duration_delta(source: Track, candidate: Track) -> Optional[int]:
    if not source.duration_s or not candidate.duration_s:
        return None
    return abs(int(source.duration_s) - int(candidate.duration_s))


def _version_penalty(source: Track, candidate: Track) -> float:
    src_v = _has_version_marker(source.title or "")
    cand_v = _has_version_marker(candidate.title or "")
    if src_v == cand_v:
        return 0.0
    if not src_v and cand_v:
        return 0.22
    if src_v and not cand_v:
        return 0.12
    return 0.0


def _match_score(source: Track, candidate: Track) -> float:
    title_score = _text_similarity(source.title or "", candidate.title or "")
    artist_score = _artist_similarity(source.artists or [], candidate.artists or [])
    album_score = _album_similarity(source, candidate)
    generic = _is_generic_title(source.title or "")

    if generic:
        score = title_score * 0.30 + artist_score * 0.55 + album_score * 0.15
    elif source.album:
        score = title_score * 0.50 + artist_score * 0.28 + album_score * 0.22
    else:
        score = title_score * 0.68 + artist_score * 0.32

    delta = _duration_delta(source, candidate)
    if delta is not None:
        if delta <= 2:
            score += 0.08
        elif delta <= _DURATION_TOLERANCE_S:
            score += 0.03
        else:
            score -= min(0.40, delta / 100)

    score -= _version_penalty(source, candidate)
    return max(0.0, min(1.0, score))


def _min_artist_score(source: Track) -> float:
    if _is_generic_title(source.title or ""):
        return 0.58
    artists = source.artists or []
    if not artists or _normalize_text(artists[0]) in {"", "unknown"}:
        return 0.0
    return 0.40


def _passes_hard_gates(source: Track, candidate: Track, score: float) -> bool:
    artist_score = _artist_similarity(source.artists or [], candidate.artists or [])
    if artist_score < _min_artist_score(source):
        return False

    delta = _duration_delta(source, candidate)
    if delta is not None and delta > _HARD_DURATION_S and score < 0.85:
        return False
    if delta is not None and delta > _DURATION_TOLERANCE_S and score < 0.72:
        return False

    if not _has_version_marker(source.title or "") and _has_version_marker(candidate.title or ""):
        if score < 0.78:
            return False

    return score >= _MIN_MATCH_SCORE


def _pick_best_candidate(source: Track, results: list[Track]) -> tuple[Optional[Track], float]:
    if not results:
        return None, 0.0
    scored = [(_match_score(source, candidate), candidate) for candidate in results]
    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best = scored[0]
    if not _passes_hard_gates(source, best, best_score):
        return None, best_score
    return best, best_score


def _build_search_queries(source: Track) -> list[str]:
    artists = source.artists or []
    title = (source.title or "").strip()
    album = (source.album or "").strip()
    queries: list[str] = []
    artist_blob_full = " ".join(artists[:4]).strip()
    artist_blob = " ".join(artists[:2]).strip()
    if artist_blob_full and title:
        queries.append(f"{artist_blob_full} {title}")
        queries.append(f"{title} {artist_blob_full}")
    if artist_blob and title:
        queries.append(f"{artist_blob} {title}")
        queries.append(f"{title} {artist_blob}")
    if title and album:
        queries.append(f"{title} {album}")
    if title:
        queries.append(title)
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)
    return unique


def _search_candidates(source: Track, tidal) -> tuple[list[Track], str]:
    seen_ids: set[str] = set()
    results: list[Track] = []
    queries = _build_search_queries(source)
    used_query = queries[0] if queries else ""
    for query in queries:
        try:
            batch = tidal.search(query, limit=_SEARCH_LIMIT_PER_QUERY)
        except Exception:
            continue
        for track in batch:
            pid = str(track.provider_id)
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            results.append(track)
        if len(results) >= _MAX_CANDIDATES:
            break
    return results[:_MAX_CANDIDATES], used_query


def _detail_from_source(position: int, source: Track, *, matched: bool, method: str, score: Optional[float] = None, hit: Optional[Track] = None) -> MatchDetail:
    return MatchDetail(
        position=position,
        matched=matched,
        method=method,
        score=score,
        source_title=source.title or "",
        source_artists=list(source.artists or []),
        tidal_title=hit.title if hit else None,
        tidal_artists=list(hit.artists or []) if hit else None,
        tidal_provider_id=str(hit.provider_id) if hit else None,
    )


def _rule_matches_source(rule: UserMatchRule, source: Track) -> bool:
    platform = (source.provider or "").lower().strip()
    rule_platform = (rule.source_platform or "*").lower().strip()
    if rule_platform not in ("*", "") and rule_platform != platform:
        return False
    if _normalize_text(rule.source_title) != _normalize_text(source.title or ""):
        return False
    if rule.source_artist:
        artist = (source.artists or [""])[0]
        if _normalize_text(rule.source_artist) != _normalize_text(artist):
            return False
    return True


def _fetch_tidal_track(provider_id: str) -> Optional[Track]:
    tidal = _tidal_provider()
    if tidal is None or not provider_id:
        return None
    try:
        with tidal._client() as client:
            return client.get_track(provider_id)
    except Exception:
        return None


def _apply_user_rule(
    position: int,
    source: Track,
    rules: list[UserMatchRule],
) -> tuple[Optional[Track], Optional[MatchDetail]]:
    for rule in rules:
        if not _rule_matches_source(rule, source):
            continue
        if rule.block_match:
            detail = _detail_from_source(position, source, matched=False, method="rule_block", score=0.0)
            log_match_result(position, source, None, method="rule_block")
            return None, detail
        if rule.tidal_provider_id:
            hit = _fetch_tidal_track(rule.tidal_provider_id.strip())
            if hit is not None:
                detail = _detail_from_source(position, source, matched=True, method="rule_override", score=1.0, hit=hit)
                log_match_result(position, source, hit, method="rule_override", score=1.0)
                return hit, detail
    return None, None


def _isrc_hit_valid(source: Track, hit: Track, isrc: str) -> bool:
    if not hit.isrc or hit.isrc.upper() != isrc.upper():
        return False
    delta = _duration_delta(source, hit)
    if delta is not None and delta > _DURATION_TOLERANCE_S:
        return False
    return True


def _lookup_isrc(isrc: str, source: Optional[Track] = None) -> Optional[Track]:
    tidal = _tidal_provider()
    if tidal is None:
        return None
    try:
        with tidal._client() as client:
            hit = client.search_by_isrc(isrc)
    except Exception:
        return None
    if hit is None:
        return None
    if source is not None and not _isrc_hit_valid(source, hit, isrc):
        return None
    return hit


def match_track_to_tidal(
    source: Track,
    *,
    isrc_cache: Optional[dict[str, Optional[Track]]] = None,
    position: int = 0,
    user_rules: Optional[list[UserMatchRule]] = None,
) -> tuple[Optional[Track], MatchDetail]:
    """Best-effort Tidal lookup for a source track (title/artist/isrc/album)."""
    rules = user_rules or []
    if rules:
        ruled_hit, ruled_detail = _apply_user_rule(position, source, rules)
        if ruled_detail is not None:
            return ruled_hit, ruled_detail

    cache = isrc_cache if isrc_cache is not None else {}

    isrc = (source.isrc or "").strip().upper()
    if isrc:
        if isrc in cache:
            hit = cache[isrc]
            if hit is not None and _isrc_hit_valid(source, hit, isrc):
                log_match_result(position, source, hit, method="isrc_cache", score=1.0)
                return hit, _detail_from_source(position, source, matched=True, method="isrc_cache", score=1.0, hit=hit)
        else:
            hit = _lookup_isrc(isrc, source)
            cache[isrc] = hit
            if hit is not None:
                log_match_result(position, source, hit, method="isrc", score=1.0)
                return hit, _detail_from_source(position, source, matched=True, method="isrc", score=1.0, hit=hit)
            log_match_result(position, source, None, method="isrc_miss", query=isrc)
            return None, _detail_from_source(position, source, matched=False, method="isrc_miss", score=0.0)

    tidal = _tidal_provider()
    if tidal is None:
        log_match_result(position, source, None, method="no_provider")
        return None, _detail_from_source(position, source, matched=False, method="no_provider")

    title = (source.title or "").strip()
    if not title:
        log_match_result(position, source, None, method="missing_title")
        return None, _detail_from_source(position, source, matched=False, method="missing_title")

    results, query = _search_candidates(source, tidal)
    if not results:
        log_match_result(position, source, None, method="search_empty", query=query)
        return None, _detail_from_source(position, source, matched=False, method="search_empty", score=0.0)

    hit, score = _pick_best_candidate(source, results)
    log_match_result(
        position,
        source,
        hit,
        method="search",
        score=score,
        query=query,
        candidates=len(results),
    )
    if hit is None:
        return None, _detail_from_source(position, source, matched=False, method="search", score=score)
    return hit, _detail_from_source(position, source, matched=True, method="search", score=score, hit=hit)


def _match_workers() -> int:
    raw = os.environ.get("TIDALDLRU_TRANSFER_MATCH_WORKERS", "")
    if raw.isdigit():
        return max(1, min(20, int(raw)))
    return _DEFAULT_MATCH_WORKERS


def _report(
    progress_cb: Optional[ProgressCallback],
    done: int,
    total: int,
    hits: list[Optional[Track]],
) -> None:
    if progress_cb is None:
        return
    matched = sum(1 for hit in hits if hit is not None)
    progress_cb(done, total, matched)


def match_tracks_to_tidal(
    sources: list[Track],
    *,
    progress_cb: Optional[ProgressCallback] = None,
    user_rules: Optional[list[UserMatchRule]] = None,
) -> tuple[list[Track], int, list[MatchDetail]]:
    """Return (matched tidal tracks in source order, unmatched count, per-source details)."""
    if not sources:
        return [], 0, []

    total = len(sources)
    isrc_cache: dict[str, Optional[Track]] = {}
    hits: list[Optional[Track]] = [None] * total
    details: list[MatchDetail] = [
        _detail_from_source(i, src, matched=False, method="pending") for i, src in enumerate(sources)
    ]
    rules = user_rules or []
    done_lock = threading.Lock()
    done_count = 0

    def _tick() -> int:
        nonlocal done_count
        with done_lock:
            done_count += 1
            current = done_count
        _report(progress_cb, current, total, hits)
        return current

    isrc_to_indices: dict[str, list[int]] = {}
    for idx, source in enumerate(sources):
        isrc = (source.isrc or "").strip().upper()
        if isrc:
            isrc_to_indices.setdefault(isrc, []).append(idx)

    unique_isrcs = list(isrc_to_indices.keys())
    if unique_isrcs:
        workers = min(_match_workers(), len(unique_isrcs))

        def _lookup_batch(isrc: str) -> tuple[str, Optional[Track]]:
            sample_idx = isrc_to_indices[isrc][0]
            return isrc, _lookup_isrc(isrc, sources[sample_idx])

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_lookup_batch, isrc): isrc for isrc in unique_isrcs}
            for future in as_completed(futures):
                isrc = futures[future]
                try:
                    _, hit = future.result()
                except Exception:
                    hit = None
                isrc_cache[isrc] = hit
                for idx in isrc_to_indices[isrc]:
                    source = sources[idx]
                    ruled_hit, ruled_detail = _apply_user_rule(idx, source, rules)
                    if ruled_detail is not None:
                        hits[idx] = ruled_hit
                        details[idx] = ruled_detail
                        _tick()
                        continue
                    if hit is not None and _isrc_hit_valid(source, hit, isrc):
                        log_match_result(idx, source, hit, method="isrc", score=1.0)
                        hits[idx] = hit
                        details[idx] = _detail_from_source(idx, source, matched=True, method="isrc", score=1.0, hit=hit)
                    else:
                        log_match_result(idx, source, None, method="isrc_rejected" if hit else "isrc_miss")
                        details[idx] = _detail_from_source(
                            idx,
                            source,
                            matched=False,
                            method="isrc_rejected" if hit else "isrc_miss",
                            score=0.0,
                        )
                    _tick()

    pending = [
        (idx, source)
        for idx, source in enumerate(sources)
        if hits[idx] is None
        and details[idx].method not in ("rule_block",)
        and (source.title or "").strip()
    ]

    if pending:
        workers = min(_match_workers(), len(pending))

        def _match_text(item: tuple[int, Track]) -> tuple[int, Optional[Track], MatchDetail]:
            idx, source = item
            hit, detail = match_track_to_tidal(source, isrc_cache=isrc_cache, position=idx, user_rules=rules)
            return idx, hit, detail

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_match_text, item): item[0] for item in pending}
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    _, hit, detail = future.result()
                except Exception:
                    hit, detail = None, _detail_from_source(idx, sources[idx], matched=False, method="error")
                hits[idx] = hit
                details[idx] = detail
                _tick()

    for idx, source in enumerate(sources):
        if details[idx].method == "pending":
            details[idx] = _detail_from_source(idx, source, matched=False, method="missing_title")

    matched = [track for track in hits if track is not None]
    return matched, total - len(matched), details
