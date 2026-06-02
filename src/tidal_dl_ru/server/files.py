from __future__ import annotations

from pathlib import Path
from typing import Optional

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from tidal_dl_ru.server.settings import settings


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.signing_secret, salt="tidaldl-file-v1")


def sign_file(job_id: str, filename: str) -> str:
    """Generate a TTL-bounded signed token for `JOBS_DIR/job_id/filename`."""
    return _serializer().dumps({"j": job_id, "f": filename})


def verify_file(token: str) -> Optional[Path]:
    """Validate a signed token; return the absolute file path or None on failure."""
    try:
        payload = _serializer().loads(token, max_age=settings.file_url_ttl_seconds)
    except (BadSignature, SignatureExpired):
        return None
    job_id = payload.get("j")
    filename = payload.get("f")
    if not job_id or not filename:
        return None
    candidate = (settings.jobs_dir / job_id / filename).resolve()
    # Path-traversal guard: result must live inside jobs_dir
    if not str(candidate).startswith(str(settings.jobs_dir.resolve())):
        return None
    if not candidate.is_file():
        return None
    return candidate
