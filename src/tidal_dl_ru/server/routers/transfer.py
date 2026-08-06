from __future__ import annotations

import asyncio
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session

from tidal_dl_ru.database.auth import get_current_user, get_optional_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User
from tidal_dl_ru.logging_config import request_id_var
from tidal_dl_ru.plan_limits import cap_stream_quality
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server import transfer_tasks
from tidal_dl_ru.server.outbound_url import OutboundUrlError, validate_public_http_url
from tidal_dl_ru.server.transfer_logging import log_import_done
from tidal_dl_ru.server.transfer_service import (
    create_playlist_from_tracks,
    get_cached_resolve,
    import_tracks_to_library,
    preview_dict_from_result,
    resolve_transfer,
    tracks_for_import_from_resolve,
)

router = APIRouter(prefix="/api/transfer", tags=["transfer"])


class TransferUrlRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class TransferPreviewStartResponse(BaseModel):
    task_id: str
    access_token: str


class TransferProgressView(BaseModel):
    phase: str
    done: int = 0
    total: int = 0
    matched: int = 0
    percent: int = 0
    label: str = ""


class TransferTaskResponse(BaseModel):
    task_id: str
    status: str
    progress: TransferProgressView
    error: Optional[str] = None
    preview: Optional["TransferPreviewResponse"] = None


class TransferPreviewTrack(BaseModel):
    provider_id: str
    title: str
    artists: list[str]
    album: Optional[str] = None
    duration_s: Optional[int] = None
    cover_url: Optional[str] = None
    match_method: Optional[str] = None
    match_score: Optional[float] = None
    source_title: Optional[str] = None
    source_artists: Optional[list[str]] = None


class TransferUnmatchedEntry(BaseModel):
    source_title: str
    source_artists: list[str] = []
    match_method: Optional[str] = None
    match_score: Optional[float] = None


class TransferPreviewResponse(BaseModel):
    task_id: Optional[str] = None
    source_kind: str
    source_title: Optional[str] = None
    source_platform: str
    total: int
    source_total: int
    unmatched_count: int = 0
    skipped_unavailable: int = 0
    tracks: list[TransferPreviewTrack]
    unmatched_entries: list[TransferUnmatchedEntry] = []


class TransferImportRequest(BaseModel):
    url: Optional[str] = Field(default=None, max_length=2048)
    task_id: Optional[str] = Field(default=None, max_length=32)
    add_to_library: bool = True
    create_playlist: bool = True
    playlist_name: Optional[str] = Field(default=None, max_length=200)
    download_flac: bool = False
    quality: str = "LOSSLESS"
    selected_indices: Optional[list[int]] = None

    @model_validator(mode="after")
    def _url_or_task(self):
        if not (self.url or "").strip() and not (self.task_id or "").strip():
            raise ValueError("url or task_id is required")
        return self


class TransferImportResponse(BaseModel):
    source_kind: str
    source_title: Optional[str] = None
    source_platform: str
    total_tracks: int
    source_total: int = 0
    unmatched_count: int = 0
    skipped_unavailable: int = 0
    added_to_library: int = 0
    already_in_library: int = 0
    playlist_id: Optional[int] = None
    playlist_name: Optional[str] = None
    download_job_id: Optional[str] = None


def _preview_tracks(tracks) -> list[TransferPreviewTrack]:
    return [
        TransferPreviewTrack(
            provider_id=str(t.provider_id),
            title=t.title,
            artists=t.artists or [],
            album=t.album,
            duration_s=t.duration_s,
            cover_url=t.cover_url,
        )
        for t in tracks
    ]


def _preview_from_dict(data: dict, task_id: Optional[str] = None) -> TransferPreviewResponse:
    tracks = [
        TransferPreviewTrack.model_validate(t) for t in data.get("tracks", [])
    ]
    unmatched = [
        TransferUnmatchedEntry.model_validate(u) for u in data.get("unmatched_entries", [])
    ]
    return TransferPreviewResponse(
        task_id=task_id,
        source_kind=data["source_kind"],
        source_title=data.get("source_title"),
        source_platform=data["source_platform"],
        total=data.get("total", len(tracks)),
        source_total=data.get("source_total", len(tracks)),
        unmatched_count=data.get("unmatched_count", 0),
        skipped_unavailable=data.get("skipped_unavailable", 0),
        tracks=tracks,
        unmatched_entries=unmatched,
    )


async def _resolve_for_import(body: TransferImportRequest) -> TransferPreviewResponse:
    if body.task_id:
        task = transfer_tasks.load_task(body.task_id.strip())
        if task and task.status == "done" and task.preview:
            return _preview_from_dict(task.preview, task.task_id)
        cached = get_cached_resolve((body.url or "").strip()) if body.url else None
        if cached is not None:
            return _preview_from_dict(preview_dict_from_result(cached), body.task_id)
    if not (body.url or "").strip():
        raise HTTPException(status_code=400, detail="Preview expired — run Preview again.")
    try:
        resolved = await resolve_transfer((body.url or "").strip())
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _preview_from_dict(preview_dict_from_result(resolved), body.task_id)


def _resolve_import_tracks(
    body: TransferImportRequest,
    preview: TransferPreviewResponse,
) -> list:
    from tidal_dl_ru.core.models import Track

    cached = None
    task_id = (body.task_id or "").strip()
    url = (body.url or "").strip()
    if task_id:
        task = transfer_tasks.load_task(task_id)
        if task:
            cached = get_cached_resolve(task.url)
    if cached is None and url:
        cached = get_cached_resolve(url)

    if cached is not None:
        return tracks_for_import_from_resolve(
            cached,
            preview,
            body.selected_indices,
        )

    tracks_payload = preview.tracks
    if body.selected_indices is not None:
        selected_set = set(body.selected_indices)
        tracks_payload = [t for i, t in enumerate(tracks_payload) if i in selected_set]

    return [
        Track(
            provider="tidal",
            provider_id=t.provider_id,
            title=t.title,
            artists=t.artists,
            album=t.album,
            duration_s=t.duration_s,
            cover_url=t.cover_url,
        )
        for t in tracks_payload
    ]


@router.post("/preview", response_model=TransferPreviewStartResponse)
async def transfer_preview_start(
    body: TransferUrlRequest,
    current_user: Optional[User] = Depends(get_optional_user),
) -> TransferPreviewStartResponse:
    try:
        safe_url = validate_public_http_url(body.url.strip())
    except OutboundUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    user_id = current_user.id if current_user else None
    task_id, access_token = transfer_tasks.create_task(safe_url, user_id=user_id)
    asyncio.create_task(transfer_tasks.run_preview_task(task_id))
    return TransferPreviewStartResponse(task_id=task_id, access_token=access_token)


@router.get("/tasks/{task_id}", response_model=TransferTaskResponse)
async def transfer_task_status(
    task_id: str,
    access_token: str = Query(..., min_length=8, max_length=128),
) -> TransferTaskResponse:
    task = transfer_tasks.load_task(task_id)
    if task is None or not task.access_token:
        raise HTTPException(status_code=404, detail="Transfer task not found or expired.")
    if not secrets.compare_digest(task.access_token, access_token):
        raise HTTPException(status_code=404, detail="Transfer task not found or expired.")
    preview = _preview_from_dict(task.preview, task.task_id) if task.preview else None
    return TransferTaskResponse(
        task_id=task.task_id,
        status=task.status,
        progress=TransferProgressView.model_validate(task.progress.model_dump()),
        error=task.error,
        preview=preview,
    )


@router.post("/import", response_model=TransferImportResponse)
async def transfer_import(
    body: TransferImportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TransferImportResponse:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    task_id = (body.task_id or "").strip()
    if task_id:
        cached_import = transfer_tasks.load_import_result(task_id)
        if cached_import is not None:
            return TransferImportResponse.model_validate(cached_import)

    preview = await _resolve_for_import(body)
    tracks = _resolve_import_tracks(body, preview)

    if not tracks:
        raise HTTPException(status_code=400, detail="No tracks to import.")

    kind = preview.source_kind
    title = preview.source_title
    source_platform = preview.source_platform

    added = already = 0
    playlist_id = None
    playlist_name = None

    if body.add_to_library:
        added, already = import_tracks_to_library(session, current_user, tracks)

    if body.create_playlist:
        default_name = title or {
            "playlist": "Imported playlist",
            "album": "Imported album",
            "track": tracks[0].title if tracks else "Imported track",
        }.get(kind, f"Imported from {source_platform}")
        playlist_name = (body.playlist_name or default_name).strip() or default_name
        pl = create_playlist_from_tracks(session, current_user, playlist_name, tracks)
        playlist_id = pl.id

    download_job_id = None
    import_url = (body.url or "").strip()
    if body.download_flac and import_url:
        from tidal_dl_ru.bot.users import reserve_web_download

        assert current_user.id is not None
        allowed, _ = reserve_web_download(current_user.id)
        if not allowed:
            raise HTTPException(status_code=403, detail="Daily download limit reached.")

        quality = cap_stream_quality(body.quality.upper(), current_user.effective_plan)
        job_id = job_state.new_job_id()
        job_state.create(
            job_id,
            provider=source_platform,
            job_type="download",
            quality=quality,
            owner_id=current_user.id,
        )
        arq_pool = getattr(request.app.state, "arq", None)
        if arq_pool is None:
            raise HTTPException(status_code=500, detail="Redis ARQ pool not available")
        await arq_pool.enqueue_job(
            "download_url",
            job_id,
            import_url,
            quality,
            False,
            False,
            False,
            False,
            False,
            request_id=request_id_var.get(),
            _job_id=job_id,
        )
        download_job_id = job_id

    log_import_done(
        user_id=current_user.id,  # type: ignore[arg-type]
        username=current_user.username or "",
        playlist_id=playlist_id,
        added=added,
        already=already,
        total=len(tracks),
        task_id=task_id or None,
        url=import_url or None,
    )

    response = TransferImportResponse(
        source_kind=kind,
        source_title=title,
        source_platform=source_platform,
        total_tracks=len(tracks),
        source_total=preview.source_total,
        unmatched_count=preview.unmatched_count,
        skipped_unavailable=preview.skipped_unavailable,
        added_to_library=added,
        already_in_library=already,
        playlist_id=playlist_id,
        playlist_name=playlist_name,
        download_job_id=download_job_id,
    )
    if task_id:
        transfer_tasks.save_import_result(task_id, response.model_dump())
    return response
