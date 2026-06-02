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
from tidal_dl_ru.database.database import engine

def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        # Fallback for browser contexts that can't send an Authorization header
        # (<audio src>, <a href> downloads, EventSource). Query-param tokens can
        # land in access logs, so this is only a fallback, not the primary path.
        token = request.query_params.get("token")
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if user is None:
            raise credentials_exception
        session.expunge(user)
        return user
