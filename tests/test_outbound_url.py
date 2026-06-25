"""Outbound URL validation tests."""

import pytest

from tidal_dl_ru.server.outbound_url import OutboundUrlError, validate_public_http_url


def test_accepts_https_public_url():
    url = validate_public_http_url("https://www.youtube.com/watch?v=abc")
    assert url.startswith("https://")


def test_rejects_file_scheme():
    with pytest.raises(OutboundUrlError):
        validate_public_http_url("file:///etc/passwd")


def test_rejects_localhost():
    with pytest.raises(OutboundUrlError):
        validate_public_http_url("http://localhost:8080/set")


def test_rejects_too_short():
    with pytest.raises(OutboundUrlError):
        validate_public_http_url("http://")


def test_accepts_rfc2606_test_host_without_dns():
    url = validate_public_http_url("https://stub.test/album/1")
    assert url == "https://stub.test/album/1"
