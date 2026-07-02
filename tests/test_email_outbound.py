"""Tests for outbound email helpers."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from tidal_dl_ru.server.email_outbound import (
    _email_verify_content,
    _password_reset_content,
    email_configured,
    email_from_address,
    public_site_base,
    send_email_verification,
    send_password_reset_email,
    send_subscription_reminder_email,
)


def test_public_site_base_default(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_PUBLIC_API_BASE", raising=False)
    assert public_site_base() == "https://flacaud.ru"


def test_public_site_base_from_env(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_PUBLIC_API_BASE", "https://staging.flacaud.ru/")
    assert public_site_base() == "https://staging.flacaud.ru"


def test_email_from_address_smtp(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_SMTP_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert email_from_address() == "noreply@flacaud.ru"


def test_email_from_address_email_env(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "test@flacaud.ru")
    assert email_from_address() == "test@flacaud.ru"


def test_email_from_address_none(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert email_from_address() is None


def test_email_configured_false(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert email_configured() is False


def test_email_configured_smtp(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("TIDALDLRU_SMTP_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert email_configured() is True


def test_email_configured_resend(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_abc123")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "noreply@flacaud.ru")
    assert email_configured() is True


def test_password_reset_content():
    subject, text, html = _password_reset_content(
        to_email="user@test.local", reset_url="https://flacaud.ru/reset?token=abc", username="alice"
    )
    assert "reset" in subject.lower()
    assert "alice" in text
    assert "https://flacaud.ru/reset?token=abc" in text
    assert "alice" in html


def test_password_reset_content_no_username():
    subject, text, html = _password_reset_content(
        to_email="user@test.local", reset_url="https://flacaud.ru/reset?token=abc", username=None
    )
    assert "user" in text  # falls back to email prefix


def test_email_verify_content():
    subject, text, html = _email_verify_content(
        to_email="user@test.local", verify_url="https://flacaud.ru/verify?token=xyz", username="bob"
    )
    assert "verify" in subject.lower()
    assert "bob" in text
    assert "https://flacaud.ru/verify?token=xyz" in text
    assert "bob" in html


def test_send_password_reset_not_configured(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert send_password_reset_email(to_email="x@t.local", reset_url="https://f.ru/r", username="x") is False


def test_send_email_verification_not_configured(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert send_email_verification(to_email="x@t.local", verify_url="https://f.ru/v", username="x") is False


def test_send_subscription_reminder_not_configured(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TIDALDLRU_SMTP_FROM", raising=False)
    monkeypatch.delenv("TIDALDLRU_EMAIL_FROM", raising=False)
    assert send_subscription_reminder_email(
        to_email="x@t.local", username="x", plan="pro",
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        days_left=2, renew_url="https://f.ru/account",
    ) is False


def test_send_password_reset_via_resend(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_fake")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_password_reset_email(
            to_email="user@t.local", reset_url="https://f.ru/r?t=1", username="user"
        )
    assert result is True


def test_send_password_reset_resend_error(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_fake")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "server error"

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_password_reset_email(
            to_email="user@t.local", reset_url="https://f.ru/r?t=1", username="user"
        )
    assert result is False


def test_send_email_verification_via_resend(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_fake")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_email_verification(
            to_email="user@t.local", verify_url="https://f.ru/v?t=1", username="user"
        )
    assert result is True


def test_send_subscription_reminder_via_resend(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_fake")
    monkeypatch.setenv("TIDALDLRU_EMAIL_FROM", "noreply@flacaud.ru")
    monkeypatch.delenv("TIDALDLRU_SMTP_HOST", raising=False)

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_subscription_reminder_email(
            to_email="user@t.local", username="user", plan="pro",
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
            days_left=2, renew_url="https://f.ru/account",
        )
    assert result is True
