import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User

# Load from env in production. Changing this invalidates all issued JWTs, so keep
# it stable across restarts (set TIDALDLRU_JWT_SECRET) — otherwise users get
# silently logged out on every redeploy.
SECRET_KEY = os.environ.get(
    "TIDALDLRU_JWT_SECRET", "your-secret-key-very-secure-flacaudio-jwt"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = session.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user
