from __future__ import annotations

import os
from pathlib import Path

from platformdirs import user_config_dir, user_downloads_dir

APP_NAME = "FlacAud"

# Stable config directory id — must match docker volume `pool-data:/root/.config/tidal-dl-ru`.
CONFIG_DIR = Path(user_config_dir("tidal-dl-ru"))
TOKENS_FILE = CONFIG_DIR / "tokens.json"
POOL_DB_FILE = CONFIG_DIR / "pool.db"
POOL_KEY_FILE = CONFIG_DIR / "pool.key"
# Fernet key for encrypting per-user connected-account OAuth tokens at rest.
OAUTH_KEY_FILE = CONFIG_DIR / "oauth.key"

DEFAULT_DOWNLOAD_DIR = Path(user_downloads_dir()) / "FlacAud"

# Tidal PKCE client (Android, from tidalapi / python-tidal).
# Grants full LOSSLESS / HI_RES access on HiFi Plus subscriptions.
# Override via env vars if Tidal rotates credentials.
# `.get(key, default)` only falls back when the key is ABSENT -- but
# docker-compose.yml injects these as `${VAR:-}`, which sets the container's
# env var to an empty string (present, just empty) when the host .env
# doesn't define it. That empty string then silently won by .get()'s rules,
# sending client_id="" to Tidal's OAuth endpoint ("Missing parameters:
# client_id") and breaking PKCE token refresh in prod. `or` treats an empty
# string as falsy and correctly falls through to the hardcoded default.
PKCE_CLIENT_ID = os.environ.get("TIDALDLRU_PKCE_CLIENT_ID") or "6BDSRdpK9hqEBTgU"
PKCE_CLIENT_SECRET = os.environ.get("TIDALDLRU_PKCE_CLIENT_SECRET") or "xeuPmY7nbpZ9IIbLAcQ93shka1VNheUAqN6IcszjTG8="
PKCE_REDIRECT_URI = "https://tidal.com/android/login/auth"

# Device-flow client (fallback).
TV_CLIENT_ID = os.environ.get("TIDALDLRU_TV_CLIENT_ID") or "fX2JxdmntZWK0ixT"
TV_CLIENT_SECRET = os.environ.get("TIDALDLRU_TV_CLIENT_SECRET") or "1Nn9AfDAjxrgJFJbKNWLeAyKGVGmINuXPPLHVXAvxAg=="

AUTH_BASE = "https://auth.tidal.com/v1/oauth2"
API_BASE = "https://api.tidal.com/v1"

DEFAULT_COUNTRY = "US"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
