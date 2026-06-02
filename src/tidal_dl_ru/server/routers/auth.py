from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from datetime import timedelta

from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User, UserCreate, UserRead
from tidal_dl_ru.database.auth import get_password_hash, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES, sign_media_token, MEDIA_TOKEN_TTL
from tidal_dl_ru.providers.tidal.auth import load_tokens, pkce_login_url, extract_code_from_url, pkce_exchange_code, save_tokens, AuthError
import httpx
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=UserRead)
def register_user(user: UserCreate, session: Session = Depends(get_session)):
    db_user = session.exec(select(User).where((User.email == user.email) | (User.username == user.username))).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email or username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": user.username}

@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    data = current_user.model_dump()
    data["effective_plan"] = current_user.effective_plan
    data["daily_limit"] = current_user.daily_limit
    return data


@router.get("/media-token")
def media_token(current_user: User = Depends(get_current_user)):
    """Mint a short-lived token for <audio src>/<a href> media URLs, so the
    long-lived session JWT never has to ride in a query string."""
    return {"token": sign_media_token(current_user.id), "expires_in": MEDIA_TOKEN_TTL}

@router.get("/status")
def auth_status():
    t = load_tokens()
    if t and t.access_token:
        return {"logged_in": True, "user_id": t.user_id, "country": t.country_code}
    return {"logged_in": False}

@router.get("/tidal-login")
def auth_login_url():
    url, verifier = pkce_login_url()
    return {"url": url, "verifier": verifier}

class AuthCallback(BaseModel):
    redirect_url: str
    verifier: str

@router.post("/callback")
def auth_callback(req: AuthCallback):
    try:
        code = extract_code_from_url(req.redirect_url)
        with httpx.Client() as c:
            tokens = pkce_exchange_code(c, code, req.verifier)
            save_tokens(tokens)
        return {"ok": True}
    except AuthError:
        raise HTTPException(status_code=400, detail="Tidal authorization failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Authorization callback failed")
