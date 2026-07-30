"""Personalized recommendations — track radio, similar tracks, mixes, library affinity."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections import defaultdict
from typing import Protocol, runtime_checkable

from sqlmodel import Session, select

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.database.models import Playlist, SavedTrack, User
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import Track as TidalTrack
from tidal_dl_ru.providers.tidal.provider import _to_universal
from tidal_dl_ru.server.rec_cache import cache_get, cache_invalidate, cache_set

logger = logging.getLogger(__name__)


@runtime_checkable
class RadioClient(Protocol):
    """Minimal provider client surface for radio/recommendation building.

    Decouples recommendations.py from the concrete TidalClient so a second
    streaming provider can be wired in by returning its own client from
    `_with_client` — no other change needed in this module.
    """

    def get_track(self, track_id: str | int) -> TidalTrack: ...
    def get_track_radio(self, track_id: str | int, limit: int = 25) -> list: ...
    def get_similar_tracks(self, track_id: str | int, limit: int = 25) -> list: ...
    def get_track_mix_tracks(self, track_id: str | int, limit: int = 25) -> list: ...
    def get_artist_radio(self, artist_id: str | int, limit: int = 25) -> list: ...
    def search_artists(self, query: str, limit: int = 10, offset: int = 0) -> list: ...
    def get_artist_top_tracks(self, artist_id: str | int) -> list: ...

_SEED_ARTISTS = (
    "The Weeknd", "Radiohead", "Daft Punk", "Kendrick Lamar", "Arctic Monkeys",
    "Billie Eilish", "Fred again..", "Disclosure", "Bon Iver", "Tyler, The Creator",
)

_MAX_PER_ARTIST = 3
_RADIO_MAX_PER_ARTIST = 3
_MIN_TRACK_SIGNAL_RATIO = 0.45
_JUNK_TITLE_FRAGMENTS = (
    "daily mix",
    "daily playlist",
    "your daily",
    "discover weekly",
    "podcast",
    "audiobook",
    "white noise",
    "sleep sounds",
)

# Content-farm / aggregator "artist" names that pollute genre seed lists.
# These come from the genres_db.json generator (which collected primary artists
# from a track search per subgenre) and are mostly compilation/playlist channels,
# cover bands, and ambient-noise products — not real artists worth radioing from.
_JUNK_ARTIST_FRAGMENTS = (
    "royalty free",
    "study music",
    "study fruits",
    "study sounds",
    "sleep sounds",
    "sleep music",
    "deep sleep",
    "white noise",
    "nature sounds",
    "binaural",
    "asmr",
    "lofi hip hop nation",
    "lofi cat",
    "lofi girl",
    "guitar heroes",
    "tribute band",
    "karaoke",
    "top 20",
    "top 40",
    "atltop20",
    "various artists",
)


def _artist_name_ok(name: str | None) -> bool:
    if not name:
        return False
    n = name.lower().strip()
    if any(frag in n for frag in _JUNK_ARTIST_FRAGMENTS):
        return False
    # " DJs" / " dj's" suffix usually marks content-farm compilation channels
    if n.endswith(" djs") or n.endswith(" dj's"):
        return False
    return True

import os

_GENRES_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "genres_db.json")

def _get_genres_db():
    if not hasattr(_get_genres_db, "cache"):
        try:
            with open(_GENRES_DB_PATH, "r", encoding="utf-8") as f:
                _get_genres_db.cache = json.load(f)
        except Exception:
            _get_genres_db.cache = {}
    return _get_genres_db.cache

def _get_seeds_for_genre(genre_name: str) -> list[str]:
    db = _get_genres_db()
    for cat in db.values():
        for sub in cat.get("subgenres", []):
            if sub["name"].lower() == genre_name.lower():
                return [a for a in sub.get("artists", []) if _artist_name_ok(a)]
    return []

def _track_ok(track: Track) -> bool:
    dur = track.duration_s or 0
    if dur and dur < 45:
        return False
    title_l = (track.title or "").lower()
    if any(frag in title_l for frag in _JUNK_TITLE_FRAGMENTS):
        return False
    return bool(track.title and track.provider_id)


def _primary_artist_id(track: Track) -> str | None:
    if track.artist_ids:
        return str(track.artist_ids[0])
    return None


def _interleave_round_robin(*lists: list) -> list:
    """Preserve Tidal order inside each source; blend radio + similar + mix."""
    buckets = [list(lst) for lst in lists if lst]
    if not buckets:
        return []
    merged: list = []
    max_len = max(len(b) for b in buckets)
    for i in range(max_len):
        for bucket in buckets:
            if i < len(bucket):
                merged.append(bucket[i])
    return merged


def _tracks_needing_cover_enrich(tracks: list[Track]) -> list[str]:
    """Ids that need get_track — missing art or duplicate stub cover across different albums."""
    need: set[str] = set()
    by_cover: dict[str, list[Track]] = defaultdict(list)

    for t in tracks:
        pid = str(t.provider_id)
        if not t.cover_url or not t.album_id:
            need.add(pid)
            continue
        by_cover[t.cover_url].append(t)

    for group in by_cover.values():
        if len(group) < 2:
            continue
        keys = {
            (str(t.album_id) if t.album_id else "", _primary_artist_id(t) or "")
            for t in group
        }
        if len(keys) > 1:
            for t in group:
                need.add(str(t.provider_id))
    return list(need)


def _merge_full_track_meta(base: Track, full: Track) -> Track:
    patch: dict = {}
    if full.cover_url:
        patch["cover_url"] = full.cover_url
    if full.album_id:
        patch["album_id"] = full.album_id
    if full.album:
        patch["album"] = full.album
    if full.duration_s and not (base.duration_s or 0):
        patch["duration_s"] = full.duration_s
    if full.artist_ids and not base.artist_ids:
        patch["artist_ids"] = full.artist_ids
        patch["artists"] = full.artists
    if full.release_date and not base.release_date:
        patch["release_date"] = full.release_date
    if full.year and not base.year:
        patch["year"] = full.year
    return base.model_copy(update=patch) if patch else base


async def _finalize_track_covers(client: RadioClient | None, tracks: list[Track]) -> list[Track]:
    """Resolve per-track album art — radio/similar list items often share a stub cover UUID."""
    if not client or not tracks:
        return tracks
    need = _tracks_needing_cover_enrich(tracks)
    if not need:
        return tracks

    sem = asyncio.Semaphore(8)

    async def _fetch(pid: str) -> tuple[str, Track | None]:
        async with sem:
            try:
                raw = await asyncio.to_thread(client.get_track, pid)
                return pid, _to_universal(raw)
            except Exception as e:
                logger.debug("cover finalize %s failed: %s", pid, e)
                return pid, None

    pairs = await asyncio.gather(*(_fetch(pid) for pid in need))
    full_by_id = {pid: uni for pid, uni in pairs if uni}

    out: list[Track] = []
    for t in tracks:
        full = full_by_id.get(str(t.provider_id))
        out.append(_merge_full_track_meta(t, full) if full else t)
    return out


def _enrich_tidal_uni(client: RadioClient | None, uni: Track) -> Track:
    if not client:
        return uni
    if uni.cover_url and (uni.duration_s or 0) > 0 and uni.album_id:
        return uni
    try:
        raw = client.get_track(uni.provider_id)
        full = _to_universal(raw)
        return _merge_full_track_meta(uni, full)
    except Exception:
        return uni


def _append_unique(
    tracks: list[Track],
    seen: set[str],
    artist_counts: dict[str, int],
    raw_items: list,
    *,
    exclude_artist_ids: set[str] | None = None,
    limit: int,
    client: RadioClient | None = None,
    max_per_artist: int = _MAX_PER_ARTIST,
) -> None:
    exclude_artist_ids = exclude_artist_ids or set()
    for t in raw_items:
        if len(tracks) >= limit:
            return
        try:
            u = _to_universal(t)
        except Exception:
            continue
        pid = str(u.provider_id)
        aid = _primary_artist_id(u)
        if pid in seen or not _track_ok(u):
            continue
        if aid and aid in exclude_artist_ids:
            continue
        if aid and artist_counts.get(aid, 0) >= max_per_artist:
            continue
        tracks.append(u)
        seen.add(pid)
        if aid:
            artist_counts[aid] = artist_counts.get(aid, 0) + 1


def _append_uni_list(
    tracks: list[Track],
    seen: set[str],
    artist_counts: dict[str, int],
    items: list[Track],
    *,
    exclude_artist_ids: set[str] | None = None,
    limit: int,
    max_per_artist: int = _MAX_PER_ARTIST,
) -> None:
    exclude_artist_ids = exclude_artist_ids or set()
    for u in items:
        if len(tracks) >= limit:
            return
        pid = str(u.provider_id)
        aid = _primary_artist_id(u)
        if pid in seen or not _track_ok(u):
            continue
        if aid and aid in exclude_artist_ids:
            continue
        if aid and artist_counts.get(aid, 0) >= max_per_artist:
            continue
        tracks.append(u)
        seen.add(pid)
        if aid:
            artist_counts[aid] = artist_counts.get(aid, 0) + 1


def _seed_artist_ids(meta: TidalTrack) -> list[str]:
    if meta.artists:
        return [str(a.id) for a in meta.artists]
    if meta.artist:
        return [str(meta.artist.id)]
    return []


def _library_seeds(user: User, session: Session) -> tuple[list[SavedTrack], set[str]]:
    saved = list(
        session.exec(
            select(SavedTrack)
            .where(SavedTrack.user_id == user.id)
            .order_by(SavedTrack.added_at.desc())  # type: ignore[attr-defined]
            .limit(40)
        ).all()
    )
    seen = {str(t.provider_id) for t in saved}
    return saved, seen


def _pick_seed_tracks(saved: list[SavedTrack], n: int | None = None) -> list[SavedTrack]:
    if not saved:
        return []
    pool = list(saved[:40])
    random.shuffle(pool)
    if n is None:
        n = random.randint(5, min(12, len(pool)))
    return pool[: max(1, min(n, len(pool)))]


def _library_affinity_track_ids(
    user: User,
    session: Session,
    seed_track_id: str,
    saved: list[SavedTrack] | None = None,
) -> list[str]:
    """Tracks co-occurring in playlists + recent library — taste context, not artist graph."""
    seed = str(seed_track_id)
    out: list[str] = []
    seen = {seed}

    try:
        from tidal_dl_ru.database.models import PlaylistTrack
        playlists_with_seed = session.exec(
            select(PlaylistTrack.playlist_id)
            .join(Playlist, PlaylistTrack.playlist_id == Playlist.id)  # type: ignore[arg-type]
            .where(Playlist.user_id == user.id, PlaylistTrack.provider_id == seed)
        ).all()
        if playlists_with_seed:
            track_rows = session.exec(
                select(PlaylistTrack.provider_id)
                .where(PlaylistTrack.playlist_id.in_(playlists_with_seed))  # type: ignore[attr-defined]
            ).all()
            for pid in track_rows:
                spid = str(pid)
                if spid and spid not in seen:
                    out.append(spid)
                    seen.add(spid)
    except Exception as e:
        logger.debug("playlist affinity failed: %s", e)

    if saved is None:
        saved, _ = _library_seeds(user, session)
    for row in saved[:24]:
        pid = str(row.provider_id)
        if pid not in seen:
            out.append(pid)
            seen.add(pid)

    random.shuffle(out)
    return out


async def _with_client():
    import httpx

    http = httpx.Client(timeout=30.0)
    try:
        acc, tokens = tidal_pool.acquire(http)
        client = TidalClient(http=http, tokens=tokens)
    except tidal_pool.NoAccountAvailable:
        client = TidalClient(http=http)
    return client, http


async def _fetch_track_neighbourhood(
    client: RadioClient,
    track_id: str,
    per_source: int = 40,
) -> tuple[list, list, list]:
    """Tidal track radio + similar + editorial mix in parallel."""
    results = await asyncio.gather(
        asyncio.to_thread(client.get_track_radio, track_id, per_source),
        asyncio.to_thread(client.get_similar_tracks, track_id, per_source),
        asyncio.to_thread(client.get_track_mix_tracks, track_id, per_source),
        return_exceptions=True,
    )
    radio = list(results[0]) if isinstance(results[0], list) else []
    similar = list(results[1]) if isinstance(results[1], list) else []
    mix = list(results[2]) if isinstance(results[2], list) else []
    random.shuffle(radio)
    random.shuffle(similar)
    random.shuffle(mix)
    for i, label in enumerate(("radio", "similar", "mix")):
        if isinstance(results[i], Exception):
            logger.debug("track %s %s failed: %s", track_id, label, results[i])
    return radio, similar, mix


async def _collect_track_neighbourhood(
    client: RadioClient,
    track_id: str,
    tracks: list[Track],
    seen: set[str],
    artist_counts: dict[str, int],
    limit: int,
    *,
    max_per_artist: int = _RADIO_MAX_PER_ARTIST,
) -> int:
    """Returns how many tracks were added from this seed."""
    before = len(tracks)
    radio, similar, mix = await _fetch_track_neighbourhood(client, track_id)
    ordered_raw = _interleave_round_robin(radio, similar, mix)
    _append_unique(
        tracks, seen, artist_counts, ordered_raw,
        limit=limit, client=client, max_per_artist=max_per_artist,
    )
    return len(tracks) - before


async def _expand_similar_graph(
    client: RadioClient,
    anchor_track_ids: list[str],
    tracks: list[Track],
    seen: set[str],
    artist_counts: dict[str, int],
    limit: int,
    *,
    max_per_artist: int = _RADIO_MAX_PER_ARTIST,
    per_anchor: int = 12,
) -> None:
    """Second hop: similar-to-similar (co-listen chain), never artist top tracks."""
    hop_ids = list(anchor_track_ids)
    random.shuffle(hop_ids)
    hop_ids = hop_ids[: max(4, min(len(hop_ids), random.randint(5, 10)))]

    async def _fetch_and_append(tid: str) -> list:
        try:
            similar = await asyncio.to_thread(client.get_similar_tracks, tid, per_anchor)
            return similar
        except Exception as e:
            logger.debug("similar graph hop failed track=%s: %s", tid, e)
            return []

    results = await asyncio.gather(*[_fetch_and_append(tid) for tid in hop_ids if tid not in seen])
    for similar in results:
        if similar:
            _append_unique(
                tracks, seen, artist_counts, similar,
                limit=limit, client=client, max_per_artist=max_per_artist,
            )
            if len(tracks) >= limit:
                return


async def _sparse_artist_radio_fallback(
    client: RadioClient,
    artist_ids: list[str],
    tracks: list[Track],
    seen: set[str],
    artist_counts: dict[str, int],
    limit: int,
) -> None:
    """Last resort only — Tidal artist *radio* (not top tracks)."""
    for aid in artist_ids[:2]:
        if len(tracks) >= limit:
            return
        try:
            items = await asyncio.to_thread(client.get_artist_radio, aid, 25)
            _append_unique(
                tracks, seen, artist_counts, items,
                limit=limit, client=client, max_per_artist=2,
            )
        except Exception as e:
            logger.debug("artist radio fallback %s: %s", aid, e)


async def build_track_radio_fast(
    track_id: str,
    limit: int = 15,
) -> list[Track]:
    """One Tidal neighbourhood round — for instant player radio bootstrap."""
    tracks: list[Track] = []
    seen: set[str] = set()
    artist_counts: dict[str, int] = defaultdict(int)

    client, http = await _with_client()
    meta: TidalTrack | None = None
    seed_uni: Track | None = None
    try:
        meta = await asyncio.to_thread(client.get_track, track_id)
        seen.add(str(track_id))
        await _collect_track_neighbourhood(
            client, str(track_id), tracks, seen, artist_counts, limit,
            max_per_artist=_RADIO_MAX_PER_ARTIST,
        )
        try:
            if meta is not None:
                seed_uni = _enrich_tidal_uni(client, _to_universal(meta))
        except Exception:
            seed_uni = None
        tracks = await _finalize_track_covers(client, tracks)
        if seed_uni is not None:
            seed_uni = _enrich_tidal_uni(client, seed_uni)
    finally:
        http.close()

    body = list(tracks)
    random.shuffle(body)
    out = body[:limit]
    if seed_uni is not None:
        sid = str(seed_uni.provider_id)
        rest = [t for t in out if str(t.provider_id) != sid]
        random.shuffle(rest)
        return ([seed_uni] + rest)[:limit]
    return out


async def build_track_radio(
    track_id: str,
    limit: int = 15,
    *,
    user: User | None = None,
    session: Session | None = None,
) -> list[Track]:
    """Radio around one seed — style signals first, library co-play, artist radio last."""
    tracks: list[Track] = []
    seen: set[str] = set()
    artist_counts: dict[str, int] = defaultdict(int)

    client, http = await _with_client()
    meta: TidalTrack | None = None
    seed_uni: Track | None = None
    try:
        meta = await asyncio.to_thread(client.get_track, track_id)
        seen.add(str(track_id))

        await _collect_track_neighbourhood(
            client, str(track_id), tracks, seen, artist_counts, limit,
            max_per_artist=_RADIO_MAX_PER_ARTIST,
        )

        anchors = [str(t.provider_id) for t in tracks[:12]]
        if str(track_id) not in anchors:
            anchors.insert(0, str(track_id))
        random.shuffle(anchors)
        await _expand_similar_graph(
            client, anchors, tracks, seen, artist_counts, limit,
            max_per_artist=_RADIO_MAX_PER_ARTIST,
        )

        if user and session:
            saved, _ = _library_seeds(user, session)
            affinity = _library_affinity_track_ids(user, session, track_id, saved)
            random.shuffle(affinity)
            affinity = affinity[: random.randint(3, 7)]

            async def _fetch_affinity(lib_tid: str):
                return await _fetch_track_neighbourhood(client, lib_tid)

            affinity_results = await asyncio.gather(*[_fetch_affinity(tid) for tid in affinity])
            for radio, similar, mix in affinity_results:
                if len(tracks) >= limit:
                    break
                ordered_raw = _interleave_round_robin(radio, similar, mix)
                _append_unique(
                    tracks, seen, artist_counts, ordered_raw,
                    limit=limit, client=client, max_per_artist=2,
                )

        min_track_signal = max(4, int(limit * _MIN_TRACK_SIGNAL_RATIO))
        if len(tracks) < min_track_signal and meta is not None:
            await _sparse_artist_radio_fallback(
                client, _seed_artist_ids(meta), tracks, seen, artist_counts, limit,
            )

        try:
            if meta is not None:
                seed_uni = _enrich_tidal_uni(client, _to_universal(meta))
        except Exception:
            seed_uni = None
        tracks = await _finalize_track_covers(client, tracks)
        if seed_uni is not None:
            seed_uni = _enrich_tidal_uni(client, seed_uni)
    finally:
        http.close()

    body = list(tracks)
    random.shuffle(body)
    out = body[:limit]
    if seed_uni is not None:
        sid = str(seed_uni.provider_id)
        rest = [t for t in out if str(t.provider_id) != sid]
        random.shuffle(rest)
        return ([seed_uni] + rest)[:limit]
    return out


async def _fetch_genre_seed_tracks(
    client: RadioClient,
    artist_names: list[str],
    seen: set[str],
    *,
    per_artist: int = 3,
    max_artists: int = 5,
) -> list[Track]:
    """Resolve real artist entities via /search (type=ARTISTS) and pull their top
    tracks. Searching tracks by artist name surfaces content titled with that
    name (covers, tributes, samples) rather than the artist's own work, which is
    why genre stations drifted toward obscure/misattributed tracks.
    """
    chosen = artist_names[:max_artists]
    sem = asyncio.Semaphore(4)

    async def _resolve(name: str) -> list[Track]:
        async with sem:
            try:
                artists = await asyncio.to_thread(client.search_artists, name, 3)
            except Exception as e:
                logger.debug("search_artists '%s' failed: %s", name, e)
                return []
            if not artists:
                return []
            # Pick the first matching artist entity (Tidal ranks by relevance).
            artist = artists[0]
            try:
                top = await asyncio.to_thread(client.get_artist_top_tracks, artist.id)
            except Exception as e:
                logger.debug("top tracks %s failed: %s", artist.id, e)
                return []
            return [_to_universal(t) for t in (top or [])[:per_artist]]

    results = await asyncio.gather(*[_resolve(n) for n in chosen])
    flat: list[Track] = []
    for group in results:
        for u in group:
            pid = str(u.provider_id)
            if pid in seen or not _track_ok(u):
                continue
            flat.append(u)
            seen.add(pid)
    random.shuffle(flat)
    return flat


async def build_recommendations(
    limit: int,
    user: User | None,
    session: Session | None,
    *,
    skip_cache: bool = False,
    exclude_ids: set[str] | None = None,
    genre: str | None = None,
) -> list[Track]:
    p = get_provider_by_name("tidal")
    if not p:
        return []

    user_key = f"{user.id if user else 'anon'}_{genre or 'vibe'}"
    exclude_ids = exclude_ids or set()
    if skip_cache:
        cache_invalidate(user_key, limit)
    elif not exclude_ids:
        cached = cache_get(user_key, limit)
        if cached is not None:
            return cached

    tracks: list[Track] = []
    seen: set[str] = set(exclude_ids)
    artist_counts: dict[str, int] = defaultdict(int)

    saved: list[SavedTrack] = []
    if user and session:
        saved, library_seen = _library_seeds(user, session)
        seen.update(library_seen)

    client, http = await _with_client()
    try:
        seed_tids: list[str] = []
        if genre:
            seed_artists = _get_seeds_for_genre(genre)
            if not seed_artists:
                # Fallback to general generic if subgenre is perfectly unknown
                logger.warning(f"No seeds found for genre '{genre}', falling back to general list")
                seed_artists = _get_seeds_for_genre("Pop")

            # Pick 5 random seed artists (was 3 — too few caused repetitive radio
            # pulled from whatever 2-3 names the dice landed on). Resolving real
            # artist entities + top tracks in parallel keeps latency flat.
            chosen_artists = random.sample(seed_artists, min(5, len(seed_artists)))

            genre_tracks = await _fetch_genre_seed_tracks(
                client, chosen_artists, seen, per_artist=3, max_artists=5,
            )

            # _fetch_genre_seed_tracks already adds every id it returns to `seen`
            # before handing them back -- re-checking `not in seen` here always
            # fails (they were *just* added), which silently zeroed out every
            # genre station's seed list. Take the results as-is.
            genre_tids: list[str] = [str(t.provider_id) for t in genre_tracks[:6] if t.provider_id]
            # We do NOT blend the listener's own random library tracks into a genre station,
            # because if their library is Indie Rock and they ask for Afro House, they will get Indie Rock mixed in!
            seed_tids = genre_tids
        else:
            seed_rows = _pick_seed_tracks(saved)
            seed_tids = [str(r.provider_id) for r in seed_rows]

        for tid in seed_tids:
            if len(tracks) >= limit:
                break
            await _collect_track_neighbourhood(
                client, tid, tracks, seen, artist_counts, limit,
            )

            # Affinity expansion only if using personal library seeds
            if not genre:
                affinity_ids = (
                    _library_affinity_track_ids(user, session, tid, saved)
                    if user and session else []
                )
                aff_sample = list(affinity_ids)
                random.shuffle(aff_sample)
                for aff_tid in aff_sample[: random.randint(2, 5)]:
                    if len(tracks) >= limit:
                        break
                    await _collect_track_neighbourhood(
                        client, aff_tid, tracks, seen, artist_counts, limit,
                        max_per_artist=2,
                    )

        anchors = [str(t.provider_id) for t in tracks[:16]]
        random.shuffle(anchors)
        await _expand_similar_graph(client, anchors, tracks, seen, artist_counts, limit)

        min_track_signal = max(6, int(limit * _MIN_TRACK_SIGNAL_RATIO))
        # Both fallbacks below pull from the *listener's own library* or a fixed
        # generic pop/EDM seed list — neither has any notion of the requested
        # genre, so running them for a genre station defeats the whole point
        # (ask for Afro House, get whatever's adjacent to the user's Indie Rock
        # library, or to The Weeknd/Disclosure's Tidal neighbourhood graph).
        # A thin genre station is better than a wrong one.
        if genre:
            if len(tracks) < min_track_signal:
                remaining = [a for a in seed_artists if a not in chosen_artists]
                if remaining:
                    random.shuffle(remaining)
                    topup_tracks = await _fetch_genre_seed_tracks(
                        client, remaining, seen, per_artist=3, max_artists=len(remaining),
                    )
                    # Same as above -- topup_tracks' ids are already in `seen`
                    # (added inside _fetch_genre_seed_tracks itself).
                    for t in topup_tracks:
                        if len(tracks) >= limit:
                            break
                        tid = str(t.provider_id) if t.provider_id else None
                        if not tid:
                            continue
                        await _collect_track_neighbourhood(
                            client, tid, tracks, seen, artist_counts, limit,
                        )
        else:
            if len(tracks) < min_track_signal and saved:
                artist_ids: list[str] = []
                for row in saved[:16]:
                    try:
                        ids = json.loads(row.artist_ids_json or "[]")
                    except json.JSONDecodeError:
                        ids = []
                    if ids:
                        artist_ids.append(str(ids[0]))
                for aid in list(dict.fromkeys(artist_ids))[:4]:
                    if len(tracks) >= limit:
                        break
                    await _sparse_artist_radio_fallback(
                        client, [aid], tracks, seen, artist_counts, limit,
                    )

            if len(tracks) < min_track_signal:
                seeds = list(_SEED_ARTISTS)
                random.shuffle(seeds)
                for name in seeds:
                    if len(tracks) >= limit:
                        break
                    try:
                        results = await asyncio.to_thread(p.search, name, 2)
                    except Exception:
                        continue
                    if not results:
                        continue
                    sid = str(results[0].provider_id)
                    if sid in seen:
                        continue
                    await _collect_track_neighbourhood(
                        client, sid, tracks, seen, artist_counts, limit,
                    )

        tracks = await _finalize_track_covers(client, tracks)
    finally:
        http.close()

    random.shuffle(tracks)
    out = tracks[:limit]
    cache_set(user_key, limit, out)
    return out
