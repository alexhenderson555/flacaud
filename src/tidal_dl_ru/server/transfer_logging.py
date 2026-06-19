"""Structured JSON logs for Library Transfer (preview, match, import)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from tidal_dl_ru.core.models import Track

logger = logging.getLogger("tidal_dl_ru.transfer")


def _track_brief(track: Optional[Track]) -> Optional[dict[str, Any]]:
    if track is None:
        return None
    return {
        "provider": track.provider,
        "provider_id": str(track.provider_id),
        "title": track.title,
        "artists": track.artists or [],
        "duration_s": track.duration_s,
        "isrc": track.isrc,
    }


def log_transfer_event(event: str, **fields: Any) -> None:
    extra = {"event": event, **{k: v for k, v in fields.items() if v is not None}}
    logger.info(event, extra=extra)


def log_source_track(position: int, track: Track, *, url: str = "", platform: str = "") -> None:
    log_transfer_event(
        "transfer_source_track",
        position=position,
        source_platform=platform or track.provider,
        url=url or None,
        source=_track_brief(track),
    )


def log_match_result(
    position: int,
    source: Track,
    hit: Optional[Track],
    *,
    method: str,
    score: Optional[float] = None,
    query: Optional[str] = None,
    candidates: int = 0,
) -> None:
    log_transfer_event(
        "transfer_match",
        position=position,
        method=method,
        match_score=score,
        search_query=query,
        candidate_count=candidates,
        source=_track_brief(source),
        tidal=_track_brief(hit),
        matched=hit is not None,
    )


def log_resolve_summary(
    *,
    url: str,
    platform: str,
    source_total: int,
    matched: int,
    unmatched: int,
    skipped_unavailable: int = 0,
    task_id: Optional[str] = None,
) -> None:
    log_transfer_event(
        "transfer_resolve_done",
        url=url,
        source_platform=platform,
        source_total=source_total,
        matched_count=matched,
        unmatched_count=unmatched,
        skipped_unavailable=skipped_unavailable,
        task_id=task_id,
    )


def log_import_done(
    *,
    user_id: int,
    username: str,
    playlist_id: Optional[int],
    added: int,
    already: int,
    total: int,
    task_id: Optional[str] = None,
    url: Optional[str] = None,
) -> None:
    log_transfer_event(
        "transfer_import_done",
        user_id=user_id,
        username=username,
        playlist_id=playlist_id,
        added_to_library=added,
        already_in_library=already,
        total_tracks=total,
        task_id=task_id,
        url=url,
    )
