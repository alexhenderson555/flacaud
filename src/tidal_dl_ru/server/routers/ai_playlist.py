"""AI playlist generation — Gemini-powered + Tidal fallback.

Extracted from catalog.py to keep the catalog router focused on search/lookup.
Handles three prompt shapes:
  - artist focus (discography) — "Moojo tracks"
  - artist similar (style neighbours) — "tracks like Daft Punk"
  - vibe/mood — "summer evening" → Gemini → Tidal search
Falls back to Tidal search heuristics when Gemini is unavailable or empty.
"""

import asyncio
import json
import logging
import os
import random
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import Artist as TidalArtist
from tidal_dl_ru.providers.tidal.provider import to_universal_enriched
from tidal_dl_ru.server.ai_playlist_cache import cache_get as ai_cache_get
from tidal_dl_ru.server.ai_playlist_cache import cache_set as ai_cache_set
from tidal_dl_ru.server.schemas import SearchResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Order matters: try stable/cheap models first. 1.5-flash is retired on v1beta (404).
_DEFAULT_GEMINI_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
)


def _gemini_models() -> tuple[str, ...]:
    raw = os.environ.get("TIDALDLRU_GEMINI_MODELS", "").strip()
    if not raw:
        return _DEFAULT_GEMINI_MODELS
    return tuple(m.strip() for m in raw.split(",") if m.strip())


class AIPlaylistRequest(BaseModel):
    query: str
    imageBase64: Optional[str] = None
    limit: int = 10


def _normalize_ai_query(query: str) -> str:
    q = query.strip()
    prefixes = (
        "Play tracks similar to ",
        "Сыграй треки, похожие на ",
        "Recommend me great tracks similar to: ",
        "Порекомендуй отличные треки, похожие на: ",
        "I like these songs: ",
        "Мне нравятся эти песни: ",
    )
    for p in prefixes:
        if q.startswith(p):
            q = q[len(p):].strip()
            break
    if q.endswith("."):
        q = q[:-1].strip()
    if " by " in q.lower():
        q = q.split(" by ")[0].strip()
    return q or query


def _library_seed_titles_from_query(query: str) -> list[str]:
    """Semicolon-separated titles from My Vibe / library-taste prompts."""
    q = query.strip()
    pairs = (
        ("I like these songs:", ". Give me a radio mix based on this taste"),
        ("Мне нравятся эти песни:", ". Сделай радио-микс на основе моего вкуса."),
    )
    for start, end in pairs:
        low = q.lower()
        s = start.lower()
        if s not in low:
            continue
        idx = low.index(s)
        rest = q[idx + len(start) :].strip()
        e = end.lower()
        if e in rest.lower():
            rest = rest[: rest.lower().index(e)].strip()
        return [p.strip() for p in rest.split(";") if p.strip()]
    return []


_ARTIST_FOCUS_SUFFIX = re.compile(
    r"^(?P<name>.+?)\s+"
    r"(?:tracks?|songs?|music|треки?|песни?|песен|треков|hits|дискографи[яю]|best\s+of)$",
    re.I,
)
_ARTIST_FOCUS_PREFIX = re.compile(
    r"^(?:tracks?|songs?|треки?|песни?)\s+by\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_SIMILAR_PATTERNS = (
    re.compile(r"^(?:tracks?|songs?|music|треки?|песни?)\s+like\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?:tracks?|songs?|треки?|песни?)\s+similar\s+to\s+(?P<name>.+)$", re.I),
    re.compile(
        r"^(?:tracks?|songs?|music|треки?|песни?)\s+in\s+(?:the\s+)?style\s+of\s+(?P<name>.+)$",
        re.I,
    ),
    re.compile(r"^in\s+(?:the\s+)?style\s+of\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?P<name>.+?)\s+style\s+(?:tracks?|songs?|music|треки?|песни?)$", re.I),
    re.compile(r"^similar\s+to\s+(?P<name>.+)$", re.I),
    re.compile(r"^like\s+(?P<name>.+)$", re.I),
    re.compile(r"^sounds?\s+like\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?:в\s+стиле|как\s+у|похожие\s+на|похожие\s+треки\s+на)\s+(?P<name>.+)$", re.I),
    re.compile(
        r"^(?:треки?|песни?)\s+(?:как\s+у|в\s+стиле|похожие\s+на)\s+(?P<name>.+)$",
        re.I,
    ),
)
_ARTIST_FOCUS_LABEL = re.compile(
    r"^(?:artist|артист|исполнитель)\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_FOCUS_LEADING = re.compile(
    r"^(?:треки?|песни?)\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_FOCUS_LEADING_SKIP = (
    "like ",
    "similar ",
    "in style of ",
    "in the style of ",
    "как у ",
    "в стиле ",
    "похож",
)
_ARTIST_FOCUS_FILLERS = (
    "play ",
    "give me ",
    "show me ",
    "i want ",
    "сыграй ",
    "дай ",
    "покажи ",
    "хочу ",
    "only ",
    "just ",
)
# Genre/mood words — "chill tracks" is a vibe, not artist "Chill".
_ARTIST_FOCUS_BLOCKLIST = frozenset({
    "chill", "summer", "winter", "spring", "autumn", "night", "morning",
    "party", "workout", "gym", "deep", "house", "techno", "trance", "lofi",
    "lo-fi", "focus", "sad", "happy", "best", "top", "new", "old", "classic",
    "indie", "rock", "pop", "jazz", "metal", "rap", "hip", "hop", "edm",
    "electronic", "ambient", "rain", "sunny", "vibe", "mix", "radio",
    "летн", "зим", "ноч", "утр", "вечер", "груст", "весел", "трен", "радио",
})


def _strip_artist_focus_filler(query: str) -> str:
    q = query.strip()
    while True:
        low = q.lower()
        matched = False
        for prefix in _ARTIST_FOCUS_FILLERS:
            if low.startswith(prefix):
                q = q[len(prefix):].strip()
                matched = True
                break
        if not matched:
            break
    return q


def _clean_artist_query_name(name: str) -> str | None:
    cleaned = (name or "").strip(" .,!?\"'")
    if not cleaned or len(cleaned) < 2 or len(cleaned) > 80:
        return None
    tokens = {t.lower() for t in re.split(r"\s+", cleaned) if t}
    if tokens & _ARTIST_FOCUS_BLOCKLIST:
        return None
    if cleaned.lower() in _ARTIST_FOCUS_BLOCKLIST:
        return None
    return cleaned


def _extract_artist_similar(query: str) -> str | None:
    """Style neighbours — e.g. 'tracks like Black Coffee', 'похожие на Daft Punk'."""
    q = _strip_artist_focus_filler(query.strip())
    if not q or ";" in q or " - " in q:
        return None
    for pattern in _ARTIST_SIMILAR_PATTERNS:
        m = pattern.match(q)
        if m:
            return _clean_artist_query_name(m.group("name") or "")
    return None


def _extract_artist_focus(query: str) -> str | None:
    """Explicit artist discography prompts — e.g. 'moojo tracks', 'треки Morgenshtern'."""
    if _extract_artist_similar(query):
        return None
    q = _strip_artist_focus_filler(query.strip())
    if not q or ";" in q or " - " in q:
        return None
    name: str | None = None
    for pattern in (_ARTIST_FOCUS_SUFFIX, _ARTIST_FOCUS_PREFIX, _ARTIST_FOCUS_LABEL):
        m = pattern.match(q)
        if m:
            name = (m.group("name") or "").strip(" .,!?\"'")
            break
    if not name:
        m = _ARTIST_FOCUS_LEADING.match(q)
        if m:
            candidate = (m.group("name") or "").strip(" .,!?\"'")
            low = candidate.lower()
            if not any(low.startswith(skip) for skip in _ARTIST_FOCUS_LEADING_SKIP):
                name = candidate
    return _clean_artist_query_name(name) if name else None


def _artist_name_matches(artist: str, target: str) -> bool:
    a = artist.strip().lower()
    t = target.strip().lower()
    if not a or not t:
        return False
    return a == t or t in a or a in t


def _pick_artist_match(candidates: list[TidalArtist], target: str) -> TidalArtist | None:
    if not candidates:
        return None
    t = target.strip().lower()
    exact = [a for a in candidates if a.name.strip().lower() == t]
    if exact:
        return exact[0]
    partial = [a for a in candidates if _artist_name_matches(a.name, target)]
    if partial:
        return min(partial, key=lambda a: abs(len(a.name) - len(target)))
    return candidates[0]


async def _artist_focus_playlist(artist_name: str, limit: int) -> list:
    """Top tracks from a named artist (Tidal artist search + toptracks)."""
    p = get_provider_by_name("tidal")
    if not p:
        return []

    def _build() -> list:
        http = httpx.Client(timeout=30.0)
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            tracks: list = []
            seen: set[str] = set()

            artists = client.search_artists(artist_name, limit=12)
            picked = _pick_artist_match(artists, artist_name)
            if picked:
                for tt in client.get_artist_top_tracks(picked.id):
                    uni = to_universal_enriched(client, tt)
                    if uni.provider_id not in seen:
                        tracks.append(uni)
                        seen.add(uni.provider_id)
                    if len(tracks) >= limit:
                        return tracks[:limit]

            for t in p.search(artist_name, limit=max(limit * 4, 20)):
                if not any(_artist_name_matches(a, artist_name) for a in (t.artists or [])):
                    continue
                if t.provider_id in seen:
                    continue
                tracks.append(t)
                seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
            return tracks[:limit]
        finally:
            http.close()

    return await asyncio.to_thread(_build)


async def _artist_similar_playlist(artist_name: str, limit: int) -> list:
    """Tracks in the style of an artist — Tidal artist radio + similar artists."""
    p = get_provider_by_name("tidal")
    if not p:
        return []

    def _build() -> list:
        http = httpx.Client(timeout=30.0)
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            tracks: list = []
            seen: set[str] = set()
            seed_id: str | None = None

            artists = client.search_artists(artist_name, limit=12)
            picked = _pick_artist_match(artists, artist_name)
            if not picked:
                return []

            seed_id = str(picked.id)
            seed_cap = max(2, limit // 5)  # only "a little" of the seed artist (~20%)

            def enrich_new(track_obj):
                """Enrich + dedupe; reserve the id immediately so pools never overlap."""
                uni = to_universal_enriched(client, track_obj)
                if uni.provider_id in seen:
                    return None
                seen.add(uni.provider_id)
                return uni

            # A little of the seed artist.
            seed_pool: list = []
            for t in client.get_artist_top_tracks(picked.id):
                if len(seed_pool) >= seed_cap:
                    break
                uni = enrich_new(t)
                if uni:
                    seed_pool.append(uni)

            # A lot of similar artists — round-robin their top tracks so no single
            # artist dominates the station.
            similar = [sa for sa in client.get_similar_artists(picked.id, limit=12)
                       if str(sa.id) != seed_id]
            per_artist: list = []
            for sa in similar:
                try:
                    per_artist.append(client.get_artist_top_tracks(sa.id)[:6])
                except Exception:  # noqa: BLE001 - skip an artist that fails to load
                    continue
            similar_pool: list = []
            depth = 0
            while any(depth < len(lst) for lst in per_artist) and len(similar_pool) < limit:
                for lst in per_artist:
                    if depth < len(lst):
                        uni = enrich_new(lst[depth])
                        if uni:
                            similar_pool.append(uni)
                depth += 1

            # Interleave: mostly similar, with a seed track sprinkled every ~5 slots
            # (and starting the station with the seed artist so it reads as "theirs").
            si = seed_i = 0
            while len(tracks) < limit and (si < len(similar_pool) or seed_i < len(seed_pool)):
                if len(tracks) % 5 == 0 and seed_i < len(seed_pool):
                    tracks.append(seed_pool[seed_i])
                    seed_i += 1
                elif si < len(similar_pool):
                    tracks.append(similar_pool[si])
                    si += 1
                elif seed_i < len(seed_pool):
                    tracks.append(seed_pool[seed_i])
                    seed_i += 1
                else:
                    break

            # Fallbacks when similar artists were sparse: Tidal artist radio, then track radio.
            if len(tracks) < limit:
                for t in client.get_artist_radio(picked.id, max(limit * 2, 30)):
                    uni = enrich_new(t)
                    if uni:
                        tracks.append(uni)
                        if len(tracks) >= limit:
                            break
            if len(tracks) < limit:
                tops = client.get_artist_top_tracks(picked.id)
                if tops:
                    for t in client.get_track_radio(tops[0].id, limit):
                        uni = enrich_new(t)
                        if uni:
                            tracks.append(uni)
                            if len(tracks) >= limit:
                                break

            return tracks[:limit]
        finally:
            http.close()

    return await asyncio.to_thread(_build)


def _looks_like_vibe_prompt(query: str) -> bool:
    """Mood/scene prompts — not explicit artist/title lookups."""
    q = query.strip()
    if not q or ";" in q:
        return False
    if _extract_artist_focus(query):
        return False
    if _extract_artist_similar(query):
        return False
    if _library_seed_titles_from_query(query):
        return False
    low = q.lower()
    if " by " in low or " - " in q:
        return False
    if low.startswith(("play ", "сыграй ", "track ", "трек ")):
        return False
    return len(q) <= 96


def _vibe_fallback_search_terms(query: str) -> list[str]:
    """Expand mood prompts into concrete Tidal queries — avoid literal phrase search."""
    ql = _normalize_ai_query(query).lower()
    terms: list[str] = []

    def add(*items: str) -> None:
        for item in items:
            if item and item not in terms:
                terms.append(item)

    summer = ("летн", "summer", "погод", "sun", "солн", "жар", "heat", "beach", "пляж", "vacation")
    night = ("night", "ноч", "midnight", "late night", "полноч")
    chill = ("chill", "relax", "лофи", "lofi", "спокой", "calm", "cozy", "уют")
    energy = ("workout", "gym", "трен", "energy", "энерг", "run", "бег", "party", "вечеринк")
    rain = ("rain", "дожд", "melanch", "груст", "sad")
    focus = ("focus", "coding", "код", "study", "учёб", "concentrat", "работ")

    if any(k in ql for k in summer):
        add("summer hits", "feel good summer", "summer pop", "chill summer", "tropical house")
    if any(k in ql for k in night):
        add("late night vibes", "night drive", "after hours", "nocturnal")
    if any(k in ql for k in chill):
        add("chill vibes", "lofi beats", "easy listening", "soft pop")
    if any(k in ql for k in energy):
        add("workout hits", "dance pop", "high energy", "party anthems")
    if any(k in ql for k in rain):
        add("rainy day", "melancholic indie", "sad songs", "ambient")
    if any(k in ql for k in focus):
        add("focus flow", "deep work", "instrumental electronic", "study beats")

    if not terms:
        add("mood mix", "feel good", "discovery mix")

    # Literal query only as a last resort — often returns title-keyword junk.
    literal = _normalize_ai_query(query)
    if literal and literal not in terms:
        terms.append(literal)
    return terms


async def _tidal_fallback_playlist(query: str, limit: int) -> list:
    similar = _extract_artist_similar(query)
    if similar:
        focus = await _artist_similar_playlist(similar, limit)
        if focus:
            return focus

    artist = _extract_artist_focus(query)
    if artist:
        focus = await _artist_focus_playlist(artist, limit)
        if focus:
            return focus

    p = get_provider_by_name("tidal")
    if not p:
        return []
    search_q = _normalize_ai_query(query)
    ql = search_q.lower()

    async def _search(term: str, n: int) -> list:
        return await asyncio.to_thread(p.search, term, min(n, 50))

    # Generic vibe / trending prompts → concrete Tidal queries that always return hits
    if any(k in ql for k in ("trend", "popular", "hit", "chart", "тренд", "популяр", "хит")):
        for term in ("top hits", "pop hits", "chart hits", "viral hits", "new releases"):
            tracks = await _search(term, limit)
            if tracks:
                return tracks[:limit]

    seed_titles = _library_seed_titles_from_query(query)
    if seed_titles:
        tracks = []
        seen: set[str] = set()
        for title in seed_titles:
            if len(tracks) >= limit:
                break
            extra = await _search(title, 5)
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
        return tracks[:limit]

    if _looks_like_vibe_prompt(query):
        tracks = []
        seen = set()
        for term in _vibe_fallback_search_terms(query):
            if len(tracks) >= limit:
                break
            extra = await _search(term, min(limit, 20))
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
        if tracks:
            return tracks[:limit]

    tracks = await _search(search_q, limit)
    seen = {t.provider_id for t in tracks}
    # Do not split vibe prompts word-by-word — "погода летняя" → songs with those words in the title.
    if (
        len(tracks) < limit
        and ";" not in search_q
        and len(search_q) < 72
        and not _looks_like_vibe_prompt(query)
    ):
        for term in search_q.split()[:6]:
            word = term.strip(";,.").lower()
            if len(word) < 4:
                continue
            extra = await asyncio.to_thread(p.search, word, min(limit, 20))
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
            if len(tracks) >= limit:
                break
    return tracks[:limit]


@router.post("/api/ai-playlist", response_model=SearchResponse)
async def ai_playlist(req: AIPlaylistRequest):
    req.limit = max(1, min(req.limit, 25))
    has_image = bool(req.imageBase64)
    artist_similar = _extract_artist_similar(req.query) if not has_image else None
    artist_focus = _extract_artist_focus(req.query) if not has_image else None

    if not artist_focus and not artist_similar:
        cached = ai_cache_get(req.query, req.limit, has_image=has_image)
        if cached is not None:
            return SearchResponse(tracks=cached)

    if artist_similar:
        try:
            tracks = await _artist_similar_playlist(artist_similar, req.limit)
            if tracks:
                ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
                return SearchResponse(tracks=tracks)
        except Exception as e:
            logger.info("Artist-similar playlist failed: %s", e)

    if artist_focus:
        try:
            tracks = await _artist_focus_playlist(artist_focus, req.limit)
            if tracks:
                ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
                return SearchResponse(tracks=tracks)
        except Exception as e:
            logger.info("Artist-focus playlist failed: %s", e)

    api_key = os.environ.get("GEMINI_API_KEY")

    async def _gemini_tracks() -> list:
        if not api_key:
            return []
        seed = random.randint(1, 100000)
        if artist_focus:
            prompt = f"""You are an expert music curator.

The user wants tracks FROM a specific artist.
Artist: "{artist_focus}"
User prompt: "{req.query}"

Rules:
- Every track MUST be by "{artist_focus}" (or the same artist under spelling variants).
- Pick their best-known, real songs on streaming services — not other artists.
- Do NOT substitute similar artists or mood-based picks.
- Generate exactly {req.limit} distinct tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""
        elif artist_similar:
            prompt = f"""You are an expert music curator.

The user wants tracks SIMILAR IN STYLE to the artist "{artist_similar}".
User prompt: "{req.query}"

Rules:
- Pick real tracks by artists in the same genre, mood, and era as "{artist_similar}".
- Prefer OTHER artists — not only "{artist_similar}"'s own discography.
- Do NOT pick unrelated genres or literal keyword matches from the user's phrase.
- Generate exactly {req.limit} distinct tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""
        else:
            prompt = f"""You are an expert music curator.

The user describes a MOOD, VIBE, SCENE, or ACTIVITY — not a song title to look up literally.
User prompt: "{req.query}"

Rules:
- Interpret the feeling (energy, genre, era, setting). Example: "summer weather" / "погода летняя" → warm pop, indie summer, beach drive — NOT songs whose titles are just those words.
- Do NOT pick tracks whose titles are obvious keyword matches or reorderings of the user's phrase.
- Mix eras and genres; avoid {req.limit} nearly identical songs.
- Only suggest real, well-known tracks that exist on streaming services.
- Match the user's language context when sensible (RU prompts → include Russian artists too).

Generate exactly {req.limit} tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""

        parts: list[dict[str, Any]] = [{"text": prompt}]
        if req.imageBase64:
            try:
                mime_type = req.imageBase64.split(";")[0].split(":")[1]
                base64_data = req.imageBase64.split(",")[1]
                parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": base64_data
                    }
                })
            except Exception as e:
                logger.info("Failed to parse imageBase64:", e)

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 1.0},
        }

        text = ""
        async with httpx.AsyncClient() as client:
            for model in _gemini_models():
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:generateContent?key={api_key}"
                )
                res = await client.post(url, json=payload, timeout=30.0)
                if res.status_code != 200:
                    logger.warning(
                        "Gemini API error model=%s status=%s body=%s",
                        model,
                        res.status_code,
                        (res.text or "")[:240],
                    )
                    continue
                data = res.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    continue
                parts_out = candidates[0].get("content", {}).get("parts") or []
                if not parts_out:
                    continue
                text = (parts_out[0].get("text") or "").strip()
                if text:
                    break

        if not text:
            return []

        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        songs = json.loads(text.strip())
        p = get_provider_by_name("tidal")
        if not p:
            return []

        async def search_song(song):
            title = (song.get("title") or "").strip()
            artist = (song.get("artist") or "").strip()
            for q in (f"{artist} {title}".strip(), title, artist):
                if len(q) < 2:
                    continue
                try:
                    res = await asyncio.to_thread(p.search, q, 5)
                    for candidate in res:
                        if artist_focus and not any(
                            _artist_name_matches(a, artist_focus) for a in (candidate.artists or [])
                        ):
                            continue
                        if artist and not any(
                            _artist_name_matches(a, artist) for a in (candidate.artists or [])
                        ):
                            continue
                        return candidate
                    if res and not artist_focus:
                        return res[0]
                except Exception:
                    continue
            return None

        results = await asyncio.gather(*(search_song(s) for s in songs))
        return [t for t in results if t is not None]

    try:
        tracks = await _gemini_tracks()
    except Exception as e:
        logger.info("Gemini generation failed: %s", e)
        tracks = []

    if not tracks:
        logger.info("AI playlist: Gemini returned no tracks, using Tidal search fallback")
        try:
            tracks = await _tidal_fallback_playlist(req.query, req.limit)
        except Exception as e:
            logger.info("Tidal fallback playlist failed: %s", e)
            tracks = []

    if not tracks:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "search_unavailable",
                "message": "Could not build playlist. Try a simpler query or check Tidal credentials.",
            },
        )

    ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
    return SearchResponse(tracks=tracks)
