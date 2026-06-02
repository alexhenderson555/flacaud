import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User

# JWT signing secret. MUST be set via TIDALDLRU_JWT_SECRET in production and kept
# stable across restarts — otherwise issued tokens silently stop validating.
# We never ship a hardcoded default: a known secret means anyone can forge a
# login token. If the env var is missing we generate a random per-process key
# (secure, but tokens won't survive a restart) and warn loudly.
SECRET_KEY = os.environ.get("TIDALDLRU_JWT_SECRET")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    warnings.warn(
        "TIDALDLRU_JWT_SECRET is not set — using an ephemeral random key. "
        "Tokens will be invalidated on restart and won't work across the "
        "api/worker containers. Set TIDALDLRU_JWT_SECRET in production.",
        RuntimeWarning,
        stacklevel=2,
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def _pw_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes and bcrypt>=4 raises on longer input,
    # so truncate up front. Hash and verify must truncate identically.
    return password.encode("utf-8")[:72]

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(_pw_bytes(plain_password), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

from fastapi import Request
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from tidal_dl_ru.database.database import engine

# ── Short-lived media tokens ────────────────────────────────────────────────
# Browser media contexts (<audio src>, <a href> downloads) can't send an
# Authorization header. Rather than leaking the 7-day session JWT in the URL
# (it lands in access logs / history), we mint a 1-hour signed token that only
# grants media/file access.
MEDIA_TOKEN_TTL = 3600  # seconds


def _media_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(SECRET_KEY, salt="tidaldl-media-v1")


def sign_media_token(user_id: int) -> str:
    return _media_serializer().dumps({"uid": user_id})


def verify_media_token(token: str) -> Optional[int]:
    try:
        data = _media_serializer().loads(token, max_age=MEDIA_TOKEN_TTL)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    return int(uid) if uid is not None else None


def _creds_exc() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _user_from_username(username: Optional[str]) -> User:
    if not username:
        raise _creds_exc()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if user is None:
            raise _creds_exc()
        session.expunge(user)
        return user


def _user_from_jwt(token: str) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise _creds_exc()
    return _user_from_username(payload.get("sub"))


def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Header-only auth (Authorization: Bearer <jwt>) for the JSON API.

    Query-param tokens are intentionally NOT accepted here — only media
    endpoints take a (short-lived) query token, via get_media_user."""
    if not token:
        raise _creds_exc()
    return _user_from_jwt(token)


def get_media_user(request: Request, token: str = Depends(oauth2_scheme)) -> User:
    """Auth for media/file GETs reachable from <audio src>/<a href>: accepts a
    short-lived ?mt= media token, falling back to the Authorization header."""
    mt = request.query_params.get("mt")
    if mt:
        uid = verify_media_token(mt)
        if uid is None:
            raise _creds_exc()
        with Session(engine) as session:
            user = session.get(User, uid)
            if user is None:
                raise _creds_exc()
            session.expunge(user)
            return user
    if not token:
        raise _creds_exc()
    return _user_from_jwt(token)
