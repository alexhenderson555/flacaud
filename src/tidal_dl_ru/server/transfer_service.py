"""Library transfer: expand any supported URL → Tidal catalog tracks."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Optional

from sqlmodel import Session, select

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.core.transfer_router import find_transfer_provider
from tidal_dl_ru.database.models import Playlist, SavedTrack, SavedTrackBase, User
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.providers.match_types import MatchDetail
from tidal_dl_ru.providers.tidal.client import parse_url
from tidal_dl_ru.providers.tidal.provider import TidalProvider
from tidal_dl_ru.providers.tidal_match import match_tracks_to_tidal
from tidal_dl_ru.server.transfer_logging import log_resolve_summary, log_source_track
from tidal_dl_ru.server.transfer_tasks import ProgressCallback

MAX_TRANSFER_TRACKS = 500
RESOLVE_CACHE_TTL_S = 900
_resolve_cache: dict[str, tuple[float, "TransferResolveResult"]] = {}


def _cache_get(url: str) -> Optional["TransferResolveResult"]:
    key = url.strip()
    item = _resolve_cache.get(key)
    if item is None:
        return None
    ts, result = item
    if time.time() - ts > RESOLVE_CACHE_TTL_S:
        _resolve_cache.pop(key, None)
        return None
    return result


def _cache_set(url: str, result: "TransferResolveResult") -> None:
    _resolve_cache[url.strip()] = (time.time(), result)


@dataclass
class TransferResolveResult:
    source_kind: str
    source_title: Optional[str]
    source_platform: str
    tracks: list[Track]
    source_total: int
    unmatched_count: int
    skipped_unavailable: int = 0
    match_details: list[MatchDetail] | None = None
    source_tracks: list[Track] | None = None

    @property
    def matched_count(self) -> int:
        return len(self.tracks)


def _tidal_source_title(provider: TidalProvider, url: str) -> tuple[str, Optional[str]]:
    link = parse_url(url)
    if link is None:
        return "unknown", None
    try:
        with provider._client() as client:
            if link.kind == "playlist":
                return link.kind, client.get_playlist(link.id).title
            if link.kind == "album":
                return link.kind, client.get_album(link.id).title
            if link.kind == "track":
                return link.kind, client.get_track(link.id).title
    except Exception:
        pass
    return link.kind, None


def _emit(
    progress_cb: Optional[ProgressCallback],
    phase: str,
    done: int,
    total: int,
    matched: int,
    label: str,
) -> None:
    if progress_cb is not None:
        progress_cb(phase, done, total, matched, label)


def _match_with_progress(
    raw: list[Track],
    progress_cb: Optional[ProgressCallback],
    user_rules=None,
) -> tuple[list[Track], int, list[MatchDetail]]:
    total = len(raw)

    def _on_match(done: int, _total: int, matched: int) -> None:
        _emit(
            progress_cb,
            "matching",
            done,
            _total,
            matched,
            f"Matching {done}/{_total} on Tidal…",
        )

    if progress_cb is not None:
        _emit(progress_cb, "matching", 0, total, 0, f"Matching 0/{total} on Tidal…")

    matched, unmatched, details = match_tracks_to_tidal(raw, progress_cb=_on_match, user_rules=user_rules)
    if not matched:
        raise ProviderError(
            "Could not match any tracks on Tidal"
            + (f" ({len(raw)} source tracks)" if raw else "")
        )
    return matched, unmatched, details


def _load_user_rules(user_id: Optional[int]) -> list:
    if not user_id:
        return []
    from tidal_dl_ru.database import database as db_mod
    from tidal_dl_ru.server.match_rules_service import rules_for_user

    with Session(db_mod.engine) as session:
        return rules_for_user(session, user_id)


def _norm(value: str) -> str:
    return " ".join((value or "").lower().strip().split())


def _sim(a: str, b: str) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def _artist_sim(src: list[str], cand: list[str]) -> float:
    if not src or not cand:
        return 0.0
    best = 0.0
    for s in src[:4]:
        for c in cand[:4]:
            best = max(best, _sim(s, c))
    return best


def _saved_row_to_track(row: SavedTrack) -> Track:
    artists: list[str] = []
    try:
        parsed = json.loads(row.artists_json or "[]")
        if isinstance(parsed, list):
            artists = [str(a) for a in parsed if str(a).strip()]
    except Exception:
        artists = []
    return Track(
        provider=(row.provider or "tidal"),
        provider_id=str(row.provider_id),
        title=row.title,
        artists=artists or ["Unknown"],
        album=row.album,
        duration_s=row.duration,
        cover_url=row.cover_url,
    )


def _recover_unmatched_from_saved_library(
    *,
    user_id: Optional[int],
    source_tracks: list[Track],
    details: list[MatchDetail],
    already_matched: list[Track],
) -> tuple[list[Track], list[MatchDetail], int]:
    if not user_id or not source_tracks or not details:
        return already_matched, details, 0

    from tidal_dl_ru.database import database as db_mod

    with Session(db_mod.engine) as session:
        saved_rows = session.exec(
            select(SavedTrack).where(SavedTrack.user_id == user_id)
        ).all()

    if not saved_rows:
        return already_matched, details, 0

    saved_tracks = [_saved_row_to_track(row) for row in saved_rows]
    matched_ids = {str(t.provider_id) for t in already_matched}
    recovered = 0
    out_tracks = list(already_matched)
    out_details = list(details)

    for idx, detail in enumerate(out_details):
        if detail.matched:
            continue
        if idx >= len(source_tracks):
            continue
        src = source_tracks[idx]
        best: tuple[float, Optional[Track]] = (0.0, None)
        for cand in saved_tracks:
            if (cand.provider or "").lower() != "tidal":
                continue
            if str(cand.provider_id) in matched_ids:
                continue
            title_score = _sim(src.title or "", cand.title or "")
            artist_score = _artist_sim(src.artists or [], cand.artists or [])
            duration_ok = (
                src.duration_s is None
                or cand.duration_s is None
                or abs(int(src.duration_s) - int(cand.duration_s)) <= 10
            )
            if not duration_ok:
                continue
            if title_score >= 0.92 and artist_score >= 0.34:
                score = title_score * 0.62 + artist_score * 0.38
            elif title_score >= 0.85 and artist_score >= 0.55:
                score = title_score * 0.58 + artist_score * 0.42
            else:
                continue
            if score > best[0]:
                best = (score, cand)

        if best[1] is None:
            continue

        hit = best[1]
        matched_ids.add(str(hit.provider_id))
        out_tracks.append(hit)
        out_details[idx] = MatchDetail(
            position=detail.position,
            matched=True,
            method="saved_library",
            score=max(0.0, min(1.0, best[0])),
            source_title=detail.source_title,
            source_artists=detail.source_artists,
            tidal_title=hit.title,
            tidal_artists=hit.artists,
            tidal_provider_id=str(hit.provider_id),
        )
        recovered += 1

    return out_tracks, out_details, recovered


def _resolve_transfer_sync(
    url: str,
    progress_cb: Optional[ProgressCallback] = None,
    user_id: Optional[int] = None,
) -> TransferResolveResult:
    provider = find_transfer_provider(url)
    if provider is None:
        raise ProviderError(
            "Unsupported URL. Use a link from Tidal, Spotify, Apple Music, "
            "YouTube Music, Yandex Music, VK, SoundCloud, or Deezer."
        )

    user_rules = _load_user_rules(user_id)
    match_details: list[MatchDetail] | None = None
    source_tracks: list[Track] | None = None

    if isinstance(provider, TidalProvider):
        _emit(progress_cb, "reading", 0, 0, 0, "Reading Tidal playlist…")
        kind, title = _tidal_source_title(provider, url)
        tracks = provider.expand(url)
        source_total = len(tracks)
        unmatched = 0
        skipped_unavailable = 0
    elif hasattr(provider, "extract_raw_tracks"):
        _emit(progress_cb, "reading", 0, 0, 0, "Reading source playlist…")
        raw, title, kind, skipped_unavailable = provider.extract_raw_tracks(url)
        if not raw:
            raise ProviderError("No tracks found at this URL")
        for pos, track in enumerate(raw):
            log_source_track(pos, track, url=url, platform=provider.name)
        source_total = len(raw) + skipped_unavailable
        source_tracks = list(raw)
        tracks, unmatched, match_details = _match_with_progress(raw, progress_cb, user_rules)
        tracks, match_details, recovered = _recover_unmatched_from_saved_library(
            user_id=user_id,
            source_tracks=raw,
            details=match_details or [],
            already_matched=tracks,
        )
        if recovered:
            unmatched = max(0, unmatched - recovered)
    elif hasattr(provider, "expand_with_stats"):
        _emit(progress_cb, "reading", 0, 0, 0, "Reading source playlist…")
        tracks, title, kind, source_total, unmatched = provider.expand_with_stats(url)
        skipped_unavailable = 0
    else:
        _emit(progress_cb, "reading", 0, 0, 0, "Reading source playlist…")
        tracks = provider.expand(url)
        kind = "playlist" if len(tracks) > 1 else "track"
        title = tracks[0].album if tracks and len(tracks) > 1 else (tracks[0].title if tracks else None)
        source_total = len(tracks)
        unmatched = 0
        skipped_unavailable = 0

    if not tracks:
        raise ProviderError("No tracks found at this URL")
    if len(tracks) > MAX_TRANSFER_TRACKS:
        raise ProviderError(f"Too many tracks ({len(tracks)}). Max {MAX_TRANSFER_TRACKS} per import.")

    _emit(
        progress_cb,
        "done",
        len(tracks),
        source_total,
        len(tracks),
        "Done",
    )

    log_resolve_summary(
        url=url,
        platform=provider.name,
        source_total=source_total,
        matched=len(tracks),
        unmatched=unmatched,
        skipped_unavailable=skipped_unavailable,
    )

    return TransferResolveResult(
        source_kind=kind,
        source_title=title,
        source_platform=provider.name,
        tracks=tracks,
        source_total=source_total,
        unmatched_count=unmatched,
        skipped_unavailable=skipped_unavailable,
        match_details=match_details,
        source_tracks=source_tracks,
    )


async def resolve_transfer(
    url: str,
    progress_cb: Optional[ProgressCallback] = None,
    user_id: Optional[int] = None,
) -> TransferResolveResult:
    key = url.strip()
    if progress_cb is None:
        cached = _cache_get(key)
        if cached is not None:
            return cached
    result = await asyncio.to_thread(_resolve_transfer_sync, key, progress_cb, user_id)
    if progress_cb is None:
        _cache_set(key, result)
    return result


def get_cached_resolve(url: str) -> Optional[TransferResolveResult]:
    return _cache_get(url.strip())


def preview_dict_from_result(result: TransferResolveResult) -> dict[str, Any]:
    tracks: list[dict[str, Any]] = []
    tidal_by_id = {str(t.provider_id): t for t in result.tracks}

    if result.match_details:
        for detail in result.match_details:
            if not detail.matched or not detail.tidal_provider_id:
                continue
            tidal = tidal_by_id.get(detail.tidal_provider_id)
            tracks.append(
                {
                    "provider_id": detail.tidal_provider_id,
                    "title": (tidal.title if tidal else detail.tidal_title) or detail.source_title,
                    "artists": (tidal.artists if tidal else detail.tidal_artists) or detail.source_artists,
                    "album": tidal.album if tidal else None,
                    "duration_s": tidal.duration_s if tidal else None,
                    "cover_url": tidal.cover_url if tidal else None,
                    "match_method": detail.method,
                    "match_score": detail.score,
                    "source_title": detail.source_title,
                    "source_artists": detail.source_artists,
                }
            )
    else:
        tracks = [
            {
                "provider_id": str(t.provider_id),
                "title": t.title,
                "artists": t.artists or [],
                "album": t.album,
                "duration_s": t.duration_s,
                "cover_url": t.cover_url,
            }
            for t in result.tracks
        ]

    unmatched_entries = []
    if result.match_details:
        unmatched_entries = [
            {
                "source_title": d.source_title,
                "source_artists": d.source_artists,
                "match_method": d.method,
                "match_score": d.score,
            }
            for d in result.match_details
            if not d.matched
        ]

    return {
        "source_kind": result.source_kind,
        "source_title": result.source_title,
        "source_platform": result.source_platform,
        "total": len(tracks),
        "source_total": result.source_total,
        "unmatched_count": result.unmatched_count,
        "skipped_unavailable": result.skipped_unavailable,
        "tracks": tracks,
        "unmatched_entries": unmatched_entries,
    }


# Backward-compatible alias used in tests
async def resolve_tidal_transfer(url: str) -> tuple[str, Optional[str], list[Track]]:
    result = await resolve_transfer(url)
    return result.source_kind, result.source_title, result.tracks


def track_to_saved_base(track: Track) -> SavedTrackBase:
    quality = track.quality
    if hasattr(quality, "value"):
        quality = quality.value
    provider = (track.provider or "tidal").lower().strip()
    return SavedTrackBase(
        provider=provider,
        provider_id=str(track.provider_id).strip(),
        title=track.title,
        artists_json=json.dumps(track.artists or []),
        artist_ids_json=json.dumps(track.artist_ids or []),
        album_id=track.album_id,
        cover_url=track.cover_url,
        duration=track.duration_s,
        album=track.album,
        release_date=track.release_date,
        quality=str(quality) if quality else "HIGH",
    )


def track_to_playlist_json(track: Track) -> dict:
    quality = track.quality
    if hasattr(quality, "value"):
        quality = quality.value
    return {
        "provider": track.provider or "tidal",
        "provider_id": str(track.provider_id),
        "title": track.title,
        "artists": track.artists or [],
        "artist_ids": track.artist_ids or [],
        "cover_url": track.cover_url,
        "duration_s": track.duration_s,
        "album": track.album or "",
        "quality": str(quality) if quality else "HIGH",
        "release_date": track.release_date,
        "source_url": track.source_url or f"https://tidal.com/track/{track.provider_id}",
    }


def _find_existing_library_track(
    session: Session,
    user_id: int,
    provider: str,
    provider_id: str,
) -> Optional[SavedTrack]:
    pid = str(provider_id).strip()
    if not pid:
        return None
    prov = (provider or "tidal").lower().strip()
    row = session.exec(
        select(SavedTrack).where(
            SavedTrack.user_id == user_id,
            SavedTrack.provider_id == pid,
            SavedTrack.provider == prov,
        )
    ).first()
    if row is not None:
        return row
    return session.exec(
        select(SavedTrack).where(
            SavedTrack.user_id == user_id,
            SavedTrack.provider_id == pid,
        )
    ).first()


def tracks_for_import_from_resolve(
    result: TransferResolveResult,
    preview,
    selected_indices: Optional[list[int]] = None,
) -> list[Track]:
    """Map preview row indices to full Tidal Track objects from resolve cache."""
    by_id = {str(t.provider_id): t for t in result.tracks}
    selected = set(selected_indices) if selected_indices is not None else None
    preview_tracks = getattr(preview, "tracks", None)
    if preview_tracks is None and isinstance(preview, dict):
        preview_tracks = preview.get("tracks", [])
    out: list[Track] = []
    for i, pt in enumerate(preview_tracks or []):
        if selected is not None and i not in selected:
            continue
        pid = str(getattr(pt, "provider_id", None) or (pt.get("provider_id") if isinstance(pt, dict) else ""))
        full = by_id.get(pid)
        if full is not None:
            out.append(full)
            continue
        out.append(
            Track(
                provider="tidal",
                provider_id=pid,
                title=getattr(pt, "title", None) or (pt.get("title") if isinstance(pt, dict) else ""),
                artists=getattr(pt, "artists", None) or (pt.get("artists") if isinstance(pt, dict) else []) or [],
                album=getattr(pt, "album", None) or (pt.get("album") if isinstance(pt, dict) else None),
                duration_s=getattr(pt, "duration_s", None) or (pt.get("duration_s") if isinstance(pt, dict) else None),
                cover_url=getattr(pt, "cover_url", None) or (pt.get("cover_url") if isinstance(pt, dict) else None),
            )
        )
    return out


def _merge_saved_track_fields(existing: SavedTrack, base: SavedTrackBase) -> bool:
    changed = False
    for attr in (
        "release_date",
        "cover_url",
        "duration",
        "album",
        "album_id",
        "artist_ids_json",
        "artists_json",
        "quality",
    ):
        new_val = getattr(base, attr, None)
        if new_val is None or new_val == "" or new_val == "[]":
            continue
        old_val = getattr(existing, attr, None)
        if attr in ("artist_ids_json", "artists_json"):
            if (not old_val or old_val == "[]") and new_val and new_val != "[]":
                setattr(existing, attr, new_val)
                changed = True
            continue
        if attr == "duration":
            if not old_val and new_val:
                setattr(existing, attr, new_val)
                changed = True
            continue
        if not old_val:
            setattr(existing, attr, new_val)
            changed = True
    return changed


def import_tracks_to_library(
    session: Session,
    user: User,
    tracks: list[Track],
) -> tuple[int, int]:
    added = 0
    already = 0
    seen: set[str] = set()
    for track in tracks:
        base = track_to_saved_base(track)
        pid = base.provider_id
        if not pid or pid in seen:
            continue
        seen.add(pid)
        existing = _find_existing_library_track(session, user.id, base.provider, pid)
        if existing:
            if _merge_saved_track_fields(existing, base):
                session.add(existing)
            already += 1
            continue
        session.add(SavedTrack(**base.model_dump(), user_id=user.id))
        session.flush()
        added += 1
    session.commit()
    return added, already


def create_playlist_from_tracks(
    session: Session,
    user: User,
    name: str,
    tracks: list[Track],
) -> Playlist:
    payload = [track_to_playlist_json(t) for t in tracks]
    pl = Playlist(name=name.strip() or "Imported playlist", user_id=user.id)
    session.add(pl)
    session.flush()
    from tidal_dl_ru.server.playlist_tracks import sync_playlist_tracks

    sync_playlist_tracks(session, pl, payload)
    session.commit()
    session.refresh(pl)
    return pl
