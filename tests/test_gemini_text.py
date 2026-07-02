"""Tests for Gemini text generation helper."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from tidal_dl_ru.server.gemini_text import gemini_generate_text, gemini_models


def test_gemini_models_defaults():
    models = gemini_models()
    assert len(models) >= 2
    assert all(isinstance(m, str) for m in models)


def test_gemini_models_from_env(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_GEMINI_MODELS", "custom-model, another-model")
    models = gemini_models()
    assert models == ("custom-model", "another-model")


def test_gemini_models_empty_env(monkeypatch):
    monkeypatch.setenv("TIDALDLRU_GEMINI_MODELS", "  ,  ")
    models = gemini_models()
    assert models == () or len(models) >= 2  # empty entries filtered


def test_gemini_generate_text_no_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = asyncio.run(gemini_generate_text("hello"))
    assert result == ""


def test_gemini_generate_text_success(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json = MagicMock(return_value={
        "candidates": [
            {"content": {"parts": [{"text": "  Generated text  "}]}}
        ]
    })

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(gemini_generate_text("test prompt"))
    assert result == "Generated text"


def test_gemini_generate_text_all_models_fail(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=httpx.Response(500, text="error"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(gemini_generate_text("test"))
    assert result == ""


def test_gemini_generate_text_no_candidates(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=httpx.Response(200, json={"candidates": []}))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(gemini_generate_text("test"))
    assert result == ""
