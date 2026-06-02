from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from tidal_dl_ru.server.schemas import JobCreate, JobStatus
from tidal_dl_ru.database.models import User
from tidal_dl_ru.database.auth import get_current_user, get_media_user
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.core.router import find_provider
import zipfile
import os

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.post("", response_model=JobStatus)
async def create_job(req: JobCreate, request: Request, current_user: User = Depends(get_current_user)) -> JobStatus:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Reset-aware quota check + reservation. Shared with the bot path so the
    # daily counter actually rolls over on a new day (previously the web path
    # only ever incremented, permanently locking users out after day one).
    from tidal_dl_ru.bot.users import reserve_web_download

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
        assert status is not None
        return status

    provider = find_provider(req.url)
    if provider is None:
        raise HTTPException(status_code=400, detail="no provider matches URL")

    job_id = job_state.new_job_id()
    job_state.create(
        job_id, provider=provider.name, job_type="download",
        quality=req.quality.value, owner_id=current_user.id,
    )

    arq_pool = getattr(request.app.state, "arq", None)
    if arq_pool is None:
        raise HTTPException(status_code=500, detail="Redis ARQ pool not available")
        
    await arq_pool.enqueue_job(
        "download_url",
        job_id,
        req.url,
        req.quality.value,
        req.lyrics,
        req.karaoke,
        req.dj_analyze,
        req.match_tidal,
        req.split,
        _job_id=job_id,
    )
        
    status = job_state.load(job_id)
    assert status is not None
    return status

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
    s = job_state.load(job_id)
    if s is not None and s.owner_id is not None and s.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your job")
    job_dir = settings.jobs_dir / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")
        
    zip_path = settings.jobs_dir / f"{job_id}.zip"
    if not zip_path.exists():
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(job_dir):
                for file in files:
                    if file.endswith('.flac') or file.endswith('.lrc') or file.endswith('.xml'):
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, job_dir)
                        zf.write(file_path, arcname)
                        
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Failed to create zip")
        
    return FileResponse(zip_path, media_type="application/zip", filename=f"{job_id}.zip")
