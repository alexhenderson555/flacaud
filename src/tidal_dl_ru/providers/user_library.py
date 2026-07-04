"""Per-user "connected account" library connectors.

The base Provider (providers/base.py) is URL-centric. This module adds an OPTIONAL
capability: read a *logged-in user's* playlists / liked songs from an external
platform, so Transfer can import private content the public-URL path can't reach.

A connector never touches the DB. The router (routers/connected_accounts.py) owns
token storage/encryption and hands a decrypted AccountAuth to fetch/refresh calls.
Fetched SourceTracks feed the existing match pipeline (transfer_service).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from tidal_dl_ru.core.models import Track


class ConnectorError(Exception):
    pass


class ConnectorNotConfigured(ConnectorError):
    """Raised when the provider's app credentials are not set (dormant connector)."""


@dataclass
class OAuthConfig:
    # "redirect" (Authorization Code), "device" (device/poll), or "token" (paste).
    flow: str
    configured: bool
    scopes: list[str] = field(default_factory=list)
    unofficial: bool = False
    note: Optional[str] = None


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None  # seconds
    scopes: Optional[list[str]] = None
    account_id: Optional[str] = None
    display_name: Optional[str] = None


@dataclass
class AccountAuth:
    """Decrypted token context the router passes into a connector."""
    access_token: Optional[str]
    refresh_token: Optional[str] = None
    account_id: Optional[str] = None


@dataclass
class DeviceAuth:
    device_code: str
    user_code: str
    verification_url: str
    interval: int = 5
    expires_in: int = 600


@dataclass
class PlaylistRef:
    id: str
    name: str
    count: Optional[int] = None
    cover: Optional[str] = None


class UserLibraryConnector(ABC):
    """Implement the flow methods your platform uses + the three fetch methods."""

    provider: str = ""
    display_name: str = ""

    @abstractmethod
    def oauth_config(self) -> OAuthConfig: ...

    # --- Redirect (Authorization Code) flow ---
    def build_authorize_url(self, *, state: str, redirect_uri: str) -> str:
        raise ConnectorError(f"{self.provider}: redirect flow not supported")

    def exchange_code(self, *, code: str, redirect_uri: str, code_verifier: Optional[str] = None) -> TokenBundle:
        raise ConnectorError(f"{self.provider}: redirect flow not supported")

    # --- Device flow ---
    def begin_device(self) -> DeviceAuth:
        raise ConnectorError(f"{self.provider}: device flow not supported")

    def poll_device(self, device_code: str) -> Optional[TokenBundle]:
        """Return a TokenBundle once authorized, None while still pending."""
        raise ConnectorError(f"{self.provider}: device flow not supported")

    # --- Token-paste flow (unofficial connectors) ---
    def exchange_token_input(self, payload: dict) -> TokenBundle:
        raise ConnectorError(f"{self.provider}: token flow not supported")

    # --- Token refresh (return None if not applicable) ---
    def refresh(self, auth: AccountAuth) -> Optional[TokenBundle]:
        return None

    # --- Library reads ---
    @abstractmethod
    def list_playlists(self, auth: AccountAuth) -> list[PlaylistRef]: ...

    @abstractmethod
    def fetch_liked(self, auth: AccountAuth) -> list[Track]: ...

    @abstractmethod
    def fetch_playlist(self, auth: AccountAuth, playlist_id: str) -> list[Track]: ...


# --- Registry ---------------------------------------------------------------

_CONNECTORS: dict[str, UserLibraryConnector] = {}


def register_connector(connector: UserLibraryConnector) -> None:
    _CONNECTORS[connector.provider] = connector


def get_connector(provider: str) -> Optional[UserLibraryConnector]:
    return _CONNECTORS.get((provider or "").strip().lower())


def all_connectors() -> list[UserLibraryConnector]:
    return list(_CONNECTORS.values())


def _load_builtin_connectors() -> None:
    """Import connector modules so they self-register. Import errors are tolerated
    (e.g. an optional unofficial dep isn't installed) — that connector stays absent."""
    modules = [
        "tidal_dl_ru.providers.connectors.spotify_connector",
        "tidal_dl_ru.providers.connectors.ytmusic_connector",
    ]
    for mod in modules:
        try:
            __import__(mod)
        except Exception:  # noqa: BLE001 — optional connector deps may be missing
            import logging

            logging.getLogger(__name__).debug("connector import skipped: %s", mod, exc_info=True)


_loaded = False


def ensure_connectors_loaded() -> None:
    global _loaded
    if not _loaded:
        _load_builtin_connectors()
        _loaded = True
