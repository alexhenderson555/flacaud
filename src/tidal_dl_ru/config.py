from __future__ import annotations

import os
from pathlib import Path

from platformdirs import user_config_dir, user_downloads_dir

APP_NAME = "tidal-dl-ru"

CONFIG_DIR = Path(user_config_dir(APP_NAME))
TOKENS_FILE = CONFIG_DIR / "tokens.json"
POOL_DB_FILE = CONFIG_DIR / "pool.db"
POOL_KEY_FILE = CONFIG_DIR / "pool.key"

DEFAULT_DOWNLOAD_DIR = Path(user_downloads_dir()) / "TidalDL"

# Tidal PKCE client (Android, from tidalapi / python-tidal).
# Grants full LOSSLESS / HI_RES access on HiFi Plus subscriptions.
# Override via env vars if Tidal rotates credentials.
PKCE_CLIENT_ID = os.environ.get("TIDALDLRU_PKCE_CLIENT_ID", "6BDSRdpK9hqEBTgU")
PKCE_CLIENT_SECRET = os.environ.get("TIDALDLRU_PKCE_CLIENT_SECRET", "xeuPmY7nbpZ9IIbLAcQ93shka1VNheUAqN6IcszjTG8=")
PKCE_REDIRECT_URI = "https://tidal.com/android/login/auth"

# Device-flow client (fallback).
TV_CLIENT_ID = os.environ.get("TIDALDLRU_TV_CLIENT_ID", "fX2JxdmntZWK0ixT")
TV_CLIENT_SECRET = os.environ.get("TIDALDLRU_TV_CLIENT_SECRET", "1Nn9AfDAjxrgJFJbKNWLeAyKGVGmINuXPPLHVXAvxAg==")

AUTH_BASE = "https://auth.tidal.com/v1/oauth2"
API_BASE = "https://api.tidal.com/v1"

DEFAULT_COUNTRY = "US"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
