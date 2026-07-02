"""Tests for production config validation and Sentry init."""

import pytest

from tidal_dl_ru.server.config_check import validate_production_config


def test_non_production_env_passes(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_ENV", "development")
    # should not raise
    validate_production_config()


def test_no_env_set_passes(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_ENV", raising=False)
    validate_production_config()


def test_production_missing_secrets_raises(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_ENV", "production")
    monkeypatch.delenv("TIDALDLRU_JWT_SECRET", raising=False)
    monkeypatch.delenv("TIDALDLRU_SIGNING_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="Production requires"):
        validate_production_config()


def test_production_with_one_secret_missing_raises(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_ENV", "production")
    monkeypatch.setenv("TIDALDLRU_JWT_SECRET", "jwt-secret-here")
    monkeypatch.delenv("TIDALDLRU_SIGNING_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="TIDALDLRU_SIGNING_SECRET"):
        validate_production_config()


def test_production_with_all_secrets_passes(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_ENV", "production")
    monkeypatch.setenv("TIDALDLRU_JWT_SECRET", "jwt-secret-here")
    monkeypatch.setenv("TIDALDLRU_SIGNING_SECRET", "signing-secret-here")
    validate_production_config()


def test_sentry_init_no_dsn(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SENTRY_DSN", raising=False)
    from tidal_dl_ru.server.sentry_init import init_sentry
    # should not raise
    init_sentry()


def test_sentry_init_empty_dsn(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_SENTRY_DSN", "  ")
    from tidal_dl_ru.server.sentry_init import init_sentry
    init_sentry()


def test_sentry_init_with_dsn_but_no_sdk(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_SENTRY_DSN", "https://fake@sentry.io/123")
    from tidal_dl_ru.server.sentry_init import init_sentry
    # sentry_sdk not installed in dev — should warn and return, not raise
    init_sentry()
