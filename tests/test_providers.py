"""Tests for providers — URL parsing, manifest handling, auth helpers."""

import re
import pytest


class TestParseUrl:
    """Test Tidal URL regex parsing without importing the full provider stack."""

    URL_RE = re.compile(
        r"tidal\.com(?:/browse)?/(?P<kind>track|album|playlist|mix)/(?P<id>[\w-]+)",
        re.IGNORECASE,
    )

    def _parse(self, url: str):
        m = self.URL_RE.search(url)
        if not m:
            return None
        return {"kind": m.group("kind").lower(), "id": m.group("id")}

    def test_track_url(self):
        result = self._parse("https://tidal.com/browse/track/64975224")
        assert result is not None
        assert result["kind"] == "track"
        assert result["id"] == "64975224"

    def test_album_url(self):
        result = self._parse("https://tidal.com/browse/album/12345678")
        assert result is not None
        assert result["kind"] == "album"
        assert result["id"] == "12345678"

    def test_playlist_url(self):
        result = self._parse("https://tidal.com/browse/playlist/abc-def-123")
        assert result is not None
        assert result["kind"] == "playlist"
        assert result["id"] == "abc-def-123"

    def test_mix_url(self):
        result = self._parse("https://tidal.com/browse/mix/abc123")
        assert result is not None
        assert result["kind"] == "mix"

    def test_no_browse_prefix(self):
        result = self._parse("https://tidal.com/track/64975224")
        assert result is not None
        assert result["kind"] == "track"

    def test_invalid_url(self):
        assert self._parse("https://example.com/track/123") is None

    def test_non_url_string(self):
        assert self._parse("not a url at all") is None

    def test_case_insensitive(self):
        result = self._parse("https://TIDAL.COM/browse/Track/123")
        assert result is not None
        assert result["kind"] == "track"


class TestExtensionFor:
    def test_flac(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("flac", "") == ".flac"

    def test_aac(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("mp4a.40.2", "") == ".m4a"

    def test_atmos(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("mha1", "") == ".mp4"

    def test_eac3(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("ec-3", "") == ".eac3"

    def test_audio_flac_mime(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("", "audio/flac") == ".flac"

    def test_unknown_defaults_m4a(self):
        from tidal_dl_ru.providers.tidal.download import extension_for
        assert extension_for("unknown", "unknown") == ".m4a"


class TestAuthHelpers:
    def test_pkce_generation(self):
        from tidal_dl_ru.providers.tidal.auth import _generate_pkce

        verifier, challenge = _generate_pkce()
        assert len(verifier) > 20
        assert len(challenge) > 20
        assert verifier != challenge

    def test_pkce_deterministic_challenge(self):
        """Same verifier should produce same challenge (S256 is deterministic)."""
        import base64
        import hashlib

        from tidal_dl_ru.providers.tidal.auth import _generate_pkce

        v, c = _generate_pkce()
        # Recompute challenge from verifier.
        digest = hashlib.sha256(v.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        assert c == expected

    def test_pkce_login_url(self):
        from tidal_dl_ru.providers.tidal.auth import pkce_login_url

        url, verifier = pkce_login_url()
        assert "login.tidal.com" in url
        assert "code_challenge=" in url
        assert "response_type=code" in url
        assert len(verifier) > 20

    def test_extract_code_from_url(self):
        from tidal_dl_ru.providers.tidal.auth import extract_code_from_url

        code = extract_code_from_url(
            "https://tidal.com/android/login/auth?code=abc123&state=xyz"
        )
        assert code == "abc123"

    def test_extract_code_missing_raises(self):
        from tidal_dl_ru.providers.tidal.auth import AuthError, extract_code_from_url

        with pytest.raises(AuthError, match="No 'code'"):
            extract_code_from_url("https://tidal.com/android/login/auth?error=denied")
