"""Tests for ops and metrics auth."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from tidal_dl_ru.server.metrics_auth import _client_ip, is_internal_scrape, require_metrics_access
from tidal_dl_ru.server.ops_auth import require_ops_access


def _mock_request(headers=None, client_host="127.0.0.1"):
    req = MagicMock()
    req.headers = headers or {}
    req.client = MagicMock() if client_host else None
    if client_host:
        req.client.host = client_host
    return req


class TestOpsAuth:
    def test_no_key_non_production_allows(self, monkeypatch):
        monkeypatch.delenv("TIDALDLRU_OPS_API_KEY", raising=False)
        monkeypatch.setenv("TIDALDLRU_ENV", "development")
        req = _mock_request()
        require_ops_access(req)  # should not raise

    def test_production_no_key_returns_404(self, monkeypatch):
        monkeypatch.delenv("TIDALDLRU_OPS_API_KEY", raising=False)
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request()
        with pytest.raises(HTTPException) as exc:
            require_ops_access(req)
        assert exc.value.status_code == 404

    def test_correct_key_allows(self, monkeypatch):
        monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-key")
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request({"X-Ops-Key": "secret-key"})
        require_ops_access(req)  # should not raise

    def test_wrong_key_rejects(self, monkeypatch):
        monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-key")
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request({"X-Ops-Key": "wrong"})
        with pytest.raises(HTTPException) as exc:
            require_ops_access(req)
        assert exc.value.status_code == 401

    def test_missing_key_when_required_rejects(self, monkeypatch):
        monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-key")
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request({})
        with pytest.raises(HTTPException) as exc:
            require_ops_access(req)
        assert exc.value.status_code == 401


class TestMetricsAuth:
    def test_internal_scrape_allows(self, monkeypatch):
        monkeypatch.delenv("TIDALDLRU_OPS_API_KEY", raising=False)
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request(client_host="10.0.0.5")
        require_metrics_access(req)  # should not raise

    def test_external_scrape_requires_key(self, monkeypatch):
        monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-key")
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request({"X-Ops-Key": "secret-key"}, client_host="8.8.8.8")
        require_metrics_access(req)  # should not raise

    def test_external_scrape_no_key_rejects(self, monkeypatch):
        monkeypatch.setenv("TIDALDLRU_OPS_API_KEY", "secret-key")
        monkeypatch.setenv("TIDALDLRU_ENV", "production")
        req = _mock_request({}, client_host="8.8.8.8")
        with pytest.raises(HTTPException):
            require_metrics_access(req)

    def test_is_internal_scrape_127(self):
        assert is_internal_scrape(_mock_request(client_host="127.0.0.1")) is True

    def test_is_internal_scrape_192_168(self):
        assert is_internal_scrape(_mock_request(client_host="192.168.1.1")) is True

    def test_is_internal_scrape_172_16(self):
        assert is_internal_scrape(_mock_request(client_host="172.16.0.1")) is True

    def test_is_internal_scrape_external(self):
        assert is_internal_scrape(_mock_request(client_host="8.8.8.8")) is False

    def test_is_internal_scrape_no_ip(self):
        assert is_internal_scrape(_mock_request(client_host="")) is False

    def test_is_internal_scrape_bad_ip(self):
        assert is_internal_scrape(_mock_request(client_host="not-an-ip")) is False

    def test_client_ip_from_forwarded(self):
        req = _mock_request({"x-forwarded-for": "10.0.0.1, 192.168.1.1"})
        assert _client_ip(req) == "10.0.0.1"

    def test_client_ip_from_client(self):
        req = _mock_request(client_host="10.0.0.2")
        assert _client_ip(req) == "10.0.0.2"

    def test_client_ip_no_client(self):
        req = _mock_request(client_host="")
        assert _client_ip(req) == ""

    def test_client_ip_no_forwarded_no_client(self):
        req = MagicMock()
        req.headers = {}
        req.client = None
        assert _client_ip(req) == ""
