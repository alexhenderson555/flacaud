import logging
import os
from datetime import timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from tidal_dl_ru.database.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    MEDIA_TOKEN_TTL,
    PASSWORD_RESET_TTL,
    create_access_token,
    get_current_user,
    get_password_hash,
    sign_email_verify_token,
    sign_media_token,
    sign_password_reset_token,
    verify_email_verify_token,
    verify_password,
    verify_password_reset_token,
)
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User, UserCreate, UserRead
from tidal_dl_ru.database.refresh_tokens import (
    REFRESH_COOKIE_NAME,
    issue_refresh_token,
    refresh_cookie_secure,
    revoke_all_refresh_sessions_for_user,
    revoke_refresh_token,
    rotate_refresh_token,
)
from tidal_dl_ru.providers.tidal.auth import (
    AuthError,
    extract_code_from_url,
    load_tokens,
    pkce_exchange_code,
    pkce_login_url,
    save_tokens,
)
from tidal_dl_ru.server.account_delete import delete_user_account
from tidal_dl_ru.server.email_outbound import (
    public_site_base,
    send_email_verification,
    send_password_reset_email,
)
from tidal_dl_ru.server.one_time_tokens import consume_token
from tidal_dl_ru.server.ops_auth import require_ops_access

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger(__name__)


def _terms_required() -> bool:
    return os.environ.get("TIDALDLRU_REQUIRE_TERMS", "true").lower() in ("1", "true", "yes", "on")


def _email_verify_required() -> bool:
    return os.environ.get("TIDALDLRU_REQUIRE_EMAIL_VERIFY", "false").lower() in ("1", "true", "yes", "on")


def _user_read(user: User) -> dict:
    data = user.model_dump()
    data["effective_plan"] = user.effective_plan
    data["daily_limit"] = user.daily_limit
    data["subscription_expires_at"] = user.subscription_expires_at
    data["dj_enabled"] = user.dj_enabled
    data["karaoke_enabled"] = user.karaoke_enabled
    data["email_verified"] = user.email_verified
    return data


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    max_age = int(os.environ.get("TIDALDLRU_REFRESH_TOKEN_DAYS", "30")) * 86400
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite="lax",
        max_age=max_age,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/auth")


def _login_payload(user: User, access_token: str) -> dict:
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "effective_plan": user.effective_plan,
        "daily_limit": user.daily_limit,
        "downloads_today": user.downloads_today,
        "subscription_expires_at": user.subscription_expires_at,
        "email_verified": user.email_verified,
        "dj_enabled": user.dj_enabled,
    }


def _user_by_login_identifier(session: Session, login: str) -> User | None:
    """Resolve account by username or email (OAuth2 form field is still `username`)."""
    ident = login.strip()
    if not ident:
        return None
    if "@" in ident:
        from sqlalchemy import func

        email = ident.lower()
        return session.exec(
            select(User).where(func.lower(User.email) == email)
        ).first()
    return session.exec(select(User).where(User.username == ident)).first()


def _queue_verification_email(email: str, username: str | None, token: str) -> None:
    verify_url = f"{public_site_base()}/verify-email?token={token}"
    send_email_verification(to_email=email, verify_url=verify_url, username=username)


@router.post("/register", response_model=UserRead)
def register_user(
    user: UserCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    if _terms_required() and not user.accept_terms:
        raise HTTPException(
            status_code=400,
            detail="You must accept the Terms of Use and Privacy Policy",
        )

    email = user.email.strip().lower() if user.email else user.email
    db_user = session.exec(select(User).where((User.email == email) | (User.username == user.username))).first()
    if db_user:
        log.warning("auth_register_failed username=%s reason=duplicate", user.username, extra={"event": "auth_register_failed", "user": user.username})
        raise HTTPException(status_code=400, detail="Email or username already registered")

    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=email,
        username=user.username,
        hashed_password=hashed_password,
        email_verified=False,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    if email:
        assert new_user.id is not None
        token = sign_email_verify_token(new_user.id)
        background_tasks.add_task(_queue_verification_email, email, new_user.username, token)

    log.info("auth_register_ok user_id=%s username=%s", new_user.id, new_user.username, extra={"event": "auth_register_ok", "user": new_user.username, "user_id": new_user.id, "username": new_user.username})
    return _user_read(new_user)


@router.post("/login")
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = _user_by_login_identifier(session, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        log.warning("auth_login_failed login=%s", form_data.username, extra={"event": "auth_login_failed", "user": form_data.username})
        raise HTTPException(status_code=400, detail="Incorrect username, email or password")

    if _email_verify_required() and not user.email_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")

    assert user.id is not None
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    refresh_raw = issue_refresh_token(session, user.id)
    _set_refresh_cookie(response, refresh_raw)

    log.info("auth_login_ok user_id=%s username=%s", user.id, user.username, extra={"event": "auth_login_ok", "user": user.username, "user_id": user.id, "username": user.username})
    return _login_payload(user, access_token)


_FORGOT_PASSWORD_MSG = (
    "If an account with that email exists, we sent a password reset link."
)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    password: str = Field(..., min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=10)


def _queue_password_reset_email(email: str, username: str | None, token: str) -> None:
    reset_url = f"{public_site_base()}/reset-password?token={token}"
    send_password_reset_email(to_email=email, reset_url=reset_url, username=username)


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    user = session.exec(select(User).where(User.email == email)).first()
    if user and user.email and user.hashed_password:
        assert user.id is not None
        token = sign_password_reset_token(user.id)
        background_tasks.add_task(_queue_password_reset_email, user.email, user.username, token)
        log.info(
            "password_reset_requested user_id=%s",
            user.id,
            extra={"event": "password_reset_requested"},
        )

    return {"ok": True, "message": _FORGOT_PASSWORD_MSG}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, session: Session = Depends(get_session)):
    uid = verify_password_reset_token(body.token)
    if uid is None or not consume_token("pwreset", body.token, PASSWORD_RESET_TTL):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = session.get(User, uid)
    if user is None or not user.email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.hashed_password = get_password_hash(body.password)
    session.add(user)
    session.commit()
    assert user.id is not None
    revoke_all_refresh_sessions_for_user(session, user.id)
    log.info(
        "password_reset_ok user_id=%s",
        user.id,
        extra={"event": "password_reset_ok"},
    )
    return {"ok": True, "message": "Password updated. You can log in now."}


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest, session: Session = Depends(get_session)):
    uid = verify_email_verify_token(body.token)
    if uid is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    user = session.get(User, uid)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    if not user.email_verified:
        user.email_verified = True
        session.add(user)
        session.commit()

    return {"ok": True, "message": "Email verified. You can log in now.", "email_verified": True}


@router.post("/resend-verification")
def resend_verification(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.email_verified:
        return {"ok": True, "message": "Email already verified"}
    if not current_user.email:
        raise HTTPException(status_code=400, detail="No email on account")

    assert current_user.id is not None
    token = sign_email_verify_token(current_user.id)
    background_tasks.add_task(
        _queue_verification_email,
        current_user.email,
        current_user.username,
        token,
    )
    return {"ok": True, "message": "Verification email sent"}


_DJ_PLANS = frozenset({"pro", "lifetime"})


class UserPreferencesUpdate(BaseModel):
    dj_enabled: bool = Field(...)


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return _user_read(current_user)


@router.patch("/me/preferences", response_model=UserRead)
def update_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if body.dj_enabled and current_user.effective_plan not in _DJ_PLANS:
        raise HTTPException(
            status_code=403,
            detail="DJ analysis requires Pro or Lifetime plan",
        )
    current_user.dj_enabled = body.dj_enabled
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return _user_read(current_user)


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


@router.delete("/account")
def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.hashed_password or not verify_password(
        body.password, current_user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Incorrect password")
    user_id = current_user.id
    delete_user_account(session, current_user)
    _clear_refresh_cookie(response)
    log.info("account_deleted user_id=%s", user_id, extra={"event": "account_deleted"})
    return {"ok": True, "message": "Account deleted"}


@router.get("/export")
def export_account_data(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Self-service GDPR export — profile, library, playlists, saved sets."""
    from tidal_dl_ru.database.models import Playlist, SavedSet, SavedTrack

    tracks = session.exec(select(SavedTrack).where(SavedTrack.user_id == current_user.id)).all()
    playlists = session.exec(select(Playlist).where(Playlist.user_id == current_user.id)).all()
    sets = session.exec(select(SavedSet).where(SavedSet.user_id == current_user.id)).all()
    return {
        "user": _user_read(current_user),
        "library": [t.model_dump() for t in tracks],
        "playlists": [p.model_dump() for p in playlists],
        "saved_sets": [s.model_dump() for s in sets],
    }


@router.get("/media-token")
def media_token(current_user: User = Depends(get_current_user)):
    """Mint a short-lived token for <audio src>/<a href> media URLs."""
    assert current_user.id is not None
    return {"token": sign_media_token(current_user.id), "expires_in": MEDIA_TOKEN_TTL}


@router.post("/refresh")
def refresh_session(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    """Rotate refresh cookie and issue a new short-lived access token.

    Uses rotate_refresh_token (not a separate consume+issue) so two
    near-simultaneous calls sharing one cookie -- two tabs, or two page loads
    from a stale-tab reload -- get back the SAME rotated pair within a short
    grace window instead of the second one 401ing and logging that tab out.
    """
    raw = request.cookies.get(REFRESH_COOKIE_NAME, "")
    rotated = rotate_refresh_token(session, raw)
    if rotated is None:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user_id, new_refresh = rotated

    user = session.get(User, user_id)
    if user is None:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if _email_verify_required() and not user.email_verified:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=403, detail="Please verify your email")

    assert user.id is not None
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    _set_refresh_cookie(response, new_refresh)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(request: Request, response: Response, session: Session = Depends(get_session)):
    raw = request.cookies.get(REFRESH_COOKIE_NAME, "")
    revoke_refresh_token(session, raw)
    _clear_refresh_cookie(response)
    return {"ok": True}


@router.get("/status")
def auth_status(request: Request):
    # Exposes pool token metadata + triggers the Tidal OAuth flow — admin only.
    # require_ops_access is a no-op when no ops key is set (dev/tests).
    require_ops_access(request)
    t = load_tokens()
    if t and t.access_token:
        return {"logged_in": True, "user_id": t.user_id, "country": t.country_code}
    return {"logged_in": False}

@router.get("/tidal-login")
def auth_login_url(request: Request):
    require_ops_access(request)
    url, verifier = pkce_login_url()
    return {"url": url, "verifier": verifier}

class AuthCallback(BaseModel):
    redirect_url: str
    verifier: str

@router.post("/callback")
def auth_callback(req: AuthCallback, request: Request):
    require_ops_access(request)
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
