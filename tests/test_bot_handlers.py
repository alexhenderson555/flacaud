"""Telegram bot handler helpers."""

from tidal_dl_ru.bot.handlers import _SET_URL_RE, _TIDAL_URL_RE, HELP_TEXT, _job_zip_url


def test_tidal_url_regex_matches_tidal():
    assert _TIDAL_URL_RE.search("https://tidal.com/browse/track/123")


def test_tidal_url_regex_rejects_youtube():
    assert not _TIDAL_URL_RE.search("https://music.youtube.com/watch?v=abc")


def test_set_url_regex_matches_youtube():
    assert _SET_URL_RE.search("https://www.youtube.com/watch?v=abc")


def test_set_url_regex_matches_soundcloud():
    assert _SET_URL_RE.search("https://soundcloud.com/dj/set")


def test_job_zip_url_uses_public_base(monkeypatch):
    from tidal_dl_ru.bot.settings import bot_settings

    monkeypatch.setattr(bot_settings, "public_api_base", "https://flacaud.ru")
    url = _job_zip_url("job-42")
    assert url == "https://flacaud.ru/api/jobs/job-42/zip"


def test_help_text_mentions_core_commands():
    assert "/analyze" in HELP_TEXT
    assert "Tidal" in HELP_TEXT
