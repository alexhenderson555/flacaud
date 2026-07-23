"""Tests for TidalClient._get's 401/429 -> on_auth_error reporting.

The pool relies on on_auth_error(401) to mark an account banned so it stops
being retried forever. A gap here (refresh "succeeds" but the retried request
still 401s) left a permanently-broken account in the active rotation.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import TokenSet


def _tokens() -> TokenSet:
    return TokenSet(
        access_token="old-access",
        refresh_token="some-refresh",
        expires_at=0.0,
        country_code="US",
    )


def _response(status_code: int, json_body=None) -> httpx.Response:
    request = httpx.Request("GET", "https://api.tidal.com/v1/whatever")
    return httpx.Response(status_code, json=json_body or {}, request=request)


class TestGetAuthErrorReporting:
    def test_401_refresh_succeeds_retry_succeeds_no_report(self, monkeypatch):
        http = MagicMock()
        http.get.side_effect = [_response(401), _response(200, {"ok": True})]
        http.headers = {}

        on_auth_error = MagicMock()
        client = TidalClient(http=http, tokens=_tokens(), on_auth_error=on_auth_error)

        monkeypatch.setattr(
            "tidal_dl_ru.providers.tidal.client._refresh",
            lambda http_, refresh_token: _tokens(),
        )

        data = client._get("/whatever")
        assert data == {"ok": True}
        on_auth_error.assert_not_called()

    def test_401_refresh_succeeds_but_retry_still_401_reports_error(self, monkeypatch):
        """The bug this test guards: refresh_token() doesn't raise (the refresh
        token itself is still valid), but the account is genuinely revoked/
        banned by Tidal, so the retried request 401s again."""
        http = MagicMock()
        http.get.side_effect = [_response(401), _response(401)]
        http.headers = {}

        on_auth_error = MagicMock()
        client = TidalClient(http=http, tokens=_tokens(), on_auth_error=on_auth_error)

        monkeypatch.setattr(
            "tidal_dl_ru.providers.tidal.client._refresh",
            lambda http_, refresh_token: _tokens(),
        )

        with pytest.raises(httpx.HTTPStatusError):
            client._get("/whatever")

        on_auth_error.assert_called_once_with(401)

    def test_401_refresh_itself_raises_reports_error(self, monkeypatch):
        http = MagicMock()
        http.get.side_effect = [_response(401)]
        http.headers = {}

        on_auth_error = MagicMock()
        client = TidalClient(http=http, tokens=_tokens(), on_auth_error=on_auth_error)

        def _raise(http_, refresh_token):
            raise RuntimeError("refresh failed")

        monkeypatch.setattr("tidal_dl_ru.providers.tidal.client._refresh", _raise)

        with pytest.raises(httpx.HTTPStatusError):
            client._get("/whatever")

        on_auth_error.assert_called_once_with(401)

    def test_429_reports_error_without_raising_first(self):
        http = MagicMock()
        http.get.side_effect = [_response(429)]
        http.headers = {}

        on_auth_error = MagicMock()
        client = TidalClient(http=http, tokens=_tokens(), on_auth_error=on_auth_error)

        with pytest.raises(httpx.HTTPStatusError):
            client._get("/whatever")

        on_auth_error.assert_called_once_with(429)
