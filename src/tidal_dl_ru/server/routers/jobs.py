import os
import re
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from tidal_dl_ru.core.router import find_provider
from tidal_dl_ru.database.auth import decode_token, get_current_user, get_media_user, oauth2_scheme
from tidal_dl_ru.database.models import User
from tidal_dl_ru.plan_limits import cap_stream_quality
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.schemas import JobCreate, JobHistoryItem, JobStatus
from tidal_dl_ru.server.settings import settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.post("", response_model=JobStatus)
async def create_job(
    req: JobCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
) -> JobStatus:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Reset-aware quota check + reservation. Shared with the bot path so the
    # daily counter actually rolls over on a new day (previously the web path
    # only ever incremented, permanently locking users out after day one).
    #
    # The Telegram bot already meters each download (bot.users.check_and_increment)
    # before calling us and marks its tokens src=bot; reserving again here would
    # double-charge the shared daily limit, so we skip it for bot-originated jobs.
    from tidal_dl_ru.bot.users import reserve_web_download

    via_bot = bool(token) and decode_token(token).get("src") == "bot"
    if not via_bot:
        allowed, _ = reserve_web_download(current_user.id)
        if not allowed:
            raise HTTPException(status_code=403, detail="Daily limit reached.")

    if req.job_type == "analyze_set":
        job_id = job_state.new_job_id()
        job_state.create(job_id, provider="youtube", job_type="analyze_set", owner_id=current_user.id)
        arq_pool = getattr(request.app.state, "arq", None)
        if arq_pool is None:
            raise HTTPException(status_code=500, detail="Redis ARQ pool not available")

        await arq_pool.enqueue_job("analyze_set", job_id, req.url, _job_id=job_id)

        status = job_state.load(job_id)
        if status is None:
            raise HTTPException(status_code=500, detail="Job state lost after creation")
        return status

    provider = find_provider(req.url)
    if provider is None:
        raise HTTPException(status_code=400, detail="no provider matches URL")

    download_quality = cap_stream_quality(req.quality.value, current_user.effective_plan)

    job_id = job_state.new_job_id()
    job_state.create(
        job_id, provider=provider.name, job_type="download",
        quality=download_quality, owner_id=current_user.id,
    )

    arq_pool = getattr(request.app.state, "arq", None)
    if arq_pool is None:
        raise HTTPException(status_code=500, detail="Redis ARQ pool not available")

    await arq_pool.enqueue_job(
        "download_url",
        job_id,
        req.url,
        download_quality,
        req.lyrics and settings.fetch_lyrics,
        req.karaoke,
        req.dj_analyze,
        req.match_tidal,
        req.split,
        _job_id=job_id,
    )

    status = job_state.load(job_id)
    if status is None:
        raise HTTPException(status_code=500, detail="Job state lost after creation")
    return status

@router.get("/mine", response_model=list[JobHistoryItem])
def my_jobs(
    limit: int = 40,
    current_user: User = Depends(get_current_user),
) -> list[JobHistoryItem]:
    """Recent download jobs for the logged-in user."""
    rows = job_state.list_jobs_for_owner(current_user.id, limit=min(max(limit, 1), 80))
    out: list[JobHistoryItem] = []
    for s in rows:
        titles = [t.title for t in s.tracks if t.title][:8]
        file_token = None
        if s.total_tracks <= 1:
            for t in s.tracks:
                if t.status == "done" and t.file_token:
                    file_token = t.file_token
                    break
        out.append(
            JobHistoryItem(
                job_id=s.job_id,
                status=s.status,
                quality=s.quality,
                created_at=s.created_at,
                updated_at=s.updated_at,
                total_tracks=s.total_tracks,
                done_tracks=s.done_tracks,
                track_titles=titles,
                file_token=file_token,
            )
        )
    return out


@router.post("/{job_id}/cancel", response_model=JobStatus)
def cancel_job(job_id: str, current_user: User = Depends(get_current_user)) -> JobStatus:
    s = job_state.load(job_id)
    if s is None:
        raise HTTPException(status_code=404, detail="job not found or expired")
    if s.owner_id is not None and s.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your job")
    if s.job_type != "analyze_set":
        raise HTTPException(status_code=400, detail="Only analyze_set jobs can be cancelled")
    if not job_state.mark_cancelled(job_id):
        raise HTTPException(status_code=409, detail="Job is not running")
    updated = job_state.load(job_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Job state lost after cancel")
    return updated


@router.get("/{job_id}", response_model=JobStatus)
def job_status(job_id: str, current_user: User = Depends(get_current_user)) -> JobStatus:
    s = job_state.load(job_id)
    if s is None:
        raise HTTPException(status_code=404, detail="job not found or expired")
    if s.owner_id is not None and s.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your job")
    return s

@router.get("/{job_id}/zip")
def download_job_zip(job_id: str, current_user: User = Depends(get_media_user)):
    # job_id is a uuid4 hex slice; reject anything else so it can't traverse
    # out of jobs_dir (e.g. "../../etc") when used as a path segment below.
    if not re.fullmatch(r"[0-9a-fA-F]{8,64}", job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    s = job_state.load(job_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    if s.owner_id is None:
        raise HTTPException(status_code=403, detail="Job ownership unknown")
    if s.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your job")
    job_dir = settings.jobs_dir / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    zip_path = settings.jobs_dir / f"{job_id}.zip"
    if not zip_path.exists():
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(job_dir):
                for file in files:
                    if file.endswith(('.flac', '.m4a', '.mp3', '.lrc', '.xml')):
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, job_dir)
                        zf.write(file_path, arcname)

    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Failed to create zip")

    return FileResponse(zip_path, media_type="application/zip", filename=f"{job_id}.zip")
