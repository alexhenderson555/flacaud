import logging
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session, select

from tidal_dl_ru.database.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    MEDIA_TOKEN_TTL,
    create_access_token,
    get_current_user,
    get_password_hash,
    sign_media_token,
    verify_password,
)
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User, UserCreate, UserRead
from tidal_dl_ru.providers.tidal.auth import (
    AuthError,
    extract_code_from_url,
    load_tokens,
    pkce_exchange_code,
    pkce_login_url,
    save_tokens,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger(__name__)


@router.post("/register", response_model=UserRead)
def register_user(user: UserCreate, session: Session = Depends(get_session)):
    db_user = session.exec(select(User).where((User.email == user.email) | (User.username == user.username))).first()
    if db_user:
        log.warning("auth_register_failed username=%s reason=duplicate", user.username, extra={"event": "auth_register_failed", "user": user.username})
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
    log.info("auth_register_ok user_id=%s username=%s", new_user.id, new_user.username, extra={"event": "auth_register_ok", "user": new_user.username})
    return new_user


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        log.warning("auth_login_failed username=%s", form_data.username, extra={"event": "auth_login_failed", "user": form_data.username})
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    log.info("auth_login_ok user_id=%s username=%s", user.id, user.username, extra={"event": "auth_login_ok", "user": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "effective_plan": user.effective_plan,
        "daily_limit": user.daily_limit,
        "downloads_today": user.downloads_today,
        "subscription_expires_at": user.subscription_expires_at,
    }

@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    data = current_user.model_dump()
    data["effective_plan"] = current_user.effective_plan
    data["daily_limit"] = current_user.daily_limit
    data["subscription_expires_at"] = current_user.subscription_expires_at
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
        log.warning("tidal_oauth_callback_failed", extra={"event": "tidal_oauth_failed"})
        raise HTTPException(status_code=400, detail="Tidal authorization failed")
    except Exception:
        log.exception("tidal_oauth_callback_error", extra={"event": "tidal_oauth_error"})
        raise HTTPException(status_code=500, detail="Authorization callback failed")
