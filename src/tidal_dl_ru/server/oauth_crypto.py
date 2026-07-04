"""Encryption + CSRF-state signing for connected-account OAuth tokens.

Mirrors the Fernet pattern in providers/tidal/pool.py: refresh/access tokens for
linked external accounts (Spotify, YouTube Music, …) are stored encrypted at rest.
The OAuth `state` value is a short-TTL signed token so authorize→callback can't be
forged.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from tidal_dl_ru.config import OAUTH_KEY_FILE, ensure_dirs
from tidal_dl_ru.server.settings import settings


class OAuthCryptoError(Exception):
    pass


def _load_or_create_key() -> bytes:
    """Fernet key from env, else a 0o600 file under the config dir (generated once)."""
    env_key = os.environ.get("TIDALDLRU_OAUTH_KEY")
    if env_key:
        return env_key.encode()
    ensure_dirs()
    if OAUTH_KEY_FILE.exists():
        return OAUTH_KEY_FILE.read_bytes().strip()
    key = Fernet.generate_key()
    OAUTH_KEY_FILE.write_bytes(key)
    try:
        os.chmod(OAUTH_KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def _fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def encrypt_token(plaintext: Optional[str]) -> Optional[str]:
    if not plaintext:
        return None
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: Optional[str]) -> Optional[str]:
    if not ciphertext:
        return None
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise OAuthCryptoError(
            "Cannot decrypt connected-account token — OAuth key mismatch. Set "
            "TIDALDLRU_OAUTH_KEY or restore oauth.key."
        ) from e


# --- OAuth state (CSRF) -----------------------------------------------------

_STATE_SALT = "connected-account-oauth-state"
_STATE_MAX_AGE_S = 600  # authorize→callback must complete within 10 minutes


def _state_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.signing_secret, salt=_STATE_SALT)


def sign_state(payload: dict[str, Any]) -> str:
    return _state_serializer().dumps(payload)


def verify_state(token: str) -> Optional[dict[str, Any]]:
    """Return the payload if the state token is valid and unexpired, else None."""
    try:
        data = _state_serializer().loads(token, max_age=_STATE_MAX_AGE_S)
        return data if isinstance(data, dict) else None
    except (BadSignature, SignatureExpired):
        return None
