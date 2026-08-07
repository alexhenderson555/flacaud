from __future__ import annotations

import base64
import hashlib
import logging
import os
import time
from typing import Optional
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from tidal_dl_ru.config import (
    AUTH_BASE,
    PKCE_CLIENT_ID,
    PKCE_CLIENT_SECRET,
    PKCE_REDIRECT_URI,
    TOKENS_FILE,
    TV_CLIENT_ID,
    TV_CLIENT_SECRET,
    ensure_dirs,
)
from tidal_dl_ru.providers.tidal.models import DeviceAuth, TokenSet

logger = logging.getLogger(__name__)

SCOPE = "r_usr+w_usr+w_sub"

LOGIN_BASE = "https://login.tidal.com"


class AuthError(Exception):
    """`status_code` carries the real HTTP status Tidal returned, when known --
    callers that ban pool accounts on auth failure need the real code, not an
    assumed one, or a transient/malformed-request failure (see the PKCE
    client_id="" incident) gets treated the same as a genuine token
    revocation and bans an otherwise-healthy account."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class PendingAuthorization(Exception):
    """User has not yet approved the device. Caller should keep polling."""


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------

def _generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for S256 PKCE."""
    verifier_bytes = os.urandom(32)
    code_verifier = base64.urlsafe_b64encode(verifier_bytes).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def pkce_login_url() -> tuple[str, str]:
    """Build the PKCE authorization URL. Returns (url, code_verifier)."""
    verifier, challenge = _generate_pkce()
    params = {
        "response_type": "code",
        "client_id": PKCE_CLIENT_ID,
        "redirect_uri": PKCE_REDIRECT_URI,
        "scope": SCOPE,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "restrict_signup": "true",
        "lang": "en",
        "appMode": "android",
    }
    url = f"{LOGIN_BASE}/authorize?{urlencode(params)}"
    return url, verifier


def pkce_exchange_code(client: httpx.Client, code: str, code_verifier: str) -> TokenSet:
    """Exchange the authorization code for tokens using PKCE."""
    resp = client.post(
        f"{AUTH_BASE}/token",
        data={
            "code": code,
            "client_id": PKCE_CLIENT_ID,
            "grant_type": "authorization_code",
            "redirect_uri": PKCE_REDIRECT_URI,
            "scope": SCOPE,
            "code_verifier": code_verifier,
            "client_secret": PKCE_CLIENT_SECRET,
        },
    )
    if resp.status_code != 200:
        raise AuthError(f"PKCE token exchange failed: {resp.status_code} {resp.text}")
    data = resp.json()
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data["refresh_token"],
        token_type=data.get("token_type", "Bearer"),
        expires_at=time.time() + int(data["expires_in"]) - 30,
        user_id=data.get("user", {}).get("userId"),
        country_code=data.get("user", {}).get("countryCode"),
    )


def extract_code_from_url(redirect_url: str) -> str:
    """Pull the 'code' query param from the redirect URL the user pastes."""
    parsed = urlparse(redirect_url)
    codes = parse_qs(parsed.query).get("code", [])
    if not codes:
        raise AuthError(
            "No 'code' parameter found in the URL. "
            "Make sure you copied the full redirect URL."
        )
    return codes[0]


# ---------------------------------------------------------------------------
# PKCE refresh (used for tokens obtained via PKCE login)
# ---------------------------------------------------------------------------

def pkce_refresh_token(client: httpx.Client, refresh: str) -> TokenSet:
    """Refresh tokens using the PKCE client credentials."""
    resp = client.post(
        f"{AUTH_BASE}/token",
        data={
            "client_id": PKCE_CLIENT_ID,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
            "scope": SCOPE,
            "client_secret": PKCE_CLIENT_SECRET,
        },
    )
    if resp.status_code != 200:
        raise AuthError(f"PKCE refresh failed: {resp.status_code} {resp.text}", status_code=resp.status_code)
    data = resp.json()
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token", refresh),
        token_type=data.get("token_type", "Bearer"),
        expires_at=time.time() + int(data["expires_in"]) - 30,
        user_id=data.get("user", {}).get("userId"),
        country_code=data.get("user", {}).get("countryCode"),
    )


# ---------------------------------------------------------------------------
# Device flow (legacy / fallback)
# ---------------------------------------------------------------------------

def _basic_auth() -> tuple[str, str]:
    return TV_CLIENT_ID, TV_CLIENT_SECRET


def request_device_code(client: httpx.Client) -> DeviceAuth:
    resp = client.post(
        f"{AUTH_BASE}/device_authorization",
        data={"client_id": TV_CLIENT_ID, "scope": SCOPE},
    )
    if resp.status_code != 200:
        raise AuthError(f"device_authorization failed: {resp.status_code} {resp.text}")
    return DeviceAuth.model_validate(resp.json())


def poll_token(client: httpx.Client, device_code: str) -> TokenSet:
    resp = client.post(
        f"{AUTH_BASE}/token",
        data={
            "client_id": TV_CLIENT_ID,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "scope": SCOPE,
        },
        auth=_basic_auth(),
    )
    if resp.status_code == 200:
        data = resp.json()
        return TokenSet(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            token_type=data.get("token_type", "Bearer"),
            expires_at=time.time() + int(data["expires_in"]) - 30,
            user_id=data.get("user", {}).get("userId"),
            country_code=data.get("user", {}).get("countryCode"),
        )

    if resp.status_code == 400:
        err = resp.json().get("error", "")
        if err in ("authorization_pending", "slow_down"):
            raise PendingAuthorization()
        if err == "expired_token":
            raise AuthError("Device code expired. Restart login.")
    raise AuthError(f"token request failed: {resp.status_code} {resp.text}")


# ---------------------------------------------------------------------------
# Unified refresh — picks the right client based on stored token
# ---------------------------------------------------------------------------

def refresh_token(client: httpx.Client, refresh: str) -> TokenSet:
    """Try PKCE refresh first, fall back to device-flow refresh."""
    try:
        return pkce_refresh_token(client, refresh)
    except AuthError:
        logger.debug("PKCE token refresh failed; falling back to device-flow", exc_info=True)
    # Fallback: device-flow client
    resp = client.post(
        f"{AUTH_BASE}/token",
        data={
            "client_id": TV_CLIENT_ID,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
            "scope": SCOPE,
        },
        auth=_basic_auth(),
    )
    if resp.status_code != 200:
        raise AuthError(f"refresh failed: {resp.status_code} {resp.text}", status_code=resp.status_code)
    data = resp.json()
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token", refresh),
        token_type=data.get("token_type", "Bearer"),
        expires_at=time.time() + int(data["expires_in"]) - 30,
        user_id=data.get("user", {}).get("userId"),
        country_code=data.get("user", {}).get("countryCode"),
    )


# ---------------------------------------------------------------------------
# Token persistence
# ---------------------------------------------------------------------------

def save_tokens(tokens: TokenSet) -> None:
    ensure_dirs()
    TOKENS_FILE.write_text(tokens.model_dump_json(indent=2), encoding="utf-8")


def load_tokens() -> Optional[TokenSet]:
    if not TOKENS_FILE.exists():
        return None
    try:
        return TokenSet.model_validate_json(TOKENS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_valid_tokens(client: httpx.Client) -> TokenSet:
    """Return live access token; refresh if needed. Raise AuthError if not logged in."""
    tokens = load_tokens()
    if tokens is None:
        raise AuthError("Not logged in. Run `tidal-dl-ru login` first.")
    if time.time() >= tokens.expires_at:
        tokens = refresh_token(client, tokens.refresh_token)
        save_tokens(tokens)
    return tokens
