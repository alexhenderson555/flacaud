"""Tests for Telegram subscription reminder sending."""

from unittest.mock import MagicMock, patch

import httpx

from tidal_dl_ru.server.subscription_telegram import send_subscription_telegram


def test_no_token_returns_false(monkeypatch):
    monkeypatch.delenv("TIDALDLRU_BOT_TOKEN", raising=False)
    assert send_subscription_telegram(12345, "hello") is False


def test_empty_token_returns_false(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_BOT_TOKEN", "  ")
    assert send_subscription_telegram(12345, "hello") is False


def test_no_telegram_id_returns_false(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_BOT_TOKEN", "fake-token")
    assert send_subscription_telegram(0, "hello") is False


def test_success_returns_true(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_BOT_TOKEN", "fake-token")

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_subscription_telegram(12345, "<b>hi</b>")
    assert result is True
    mock_client.post.assert_called_once()
    call_args = mock_client.post.call_args
    assert "sendMessage" in call_args[0][0]
    assert call_args[1]["json"]["parse_mode"] == "HTML"


def test_non_200_returns_false(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_BOT_TOKEN", "fake-token")

    mock_response = MagicMock()
    mock_response.status_code = 500

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(return_value=mock_response)

    with patch("httpx.Client", return_value=mock_client):
        result = send_subscription_telegram(12345, "hello")
    assert result is False


def test_http_error_returns_false(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_BOT_TOKEN", "fake-token")

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post = MagicMock(side_effect=httpx.HTTPError("timeout"))

    with patch("httpx.Client", return_value=mock_client):
        result = send_subscription_telegram(12345, "hello")
    assert result is False
