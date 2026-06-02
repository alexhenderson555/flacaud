"""Tests for core.translate — LRC parsing and reassembly."""

import pytest

from tidal_dl_ru.core.translate import _parse_lrc, _reassemble


class TestParseLrc:
    def test_simple_lines(self):
        lrc = "[00:12.34] Hello world\n[00:15.00] Second line"
        pairs = _parse_lrc(lrc)
        assert len(pairs) == 2
        assert pairs[0] == ("[00:12.34]", "Hello world")
        assert pairs[1] == ("[00:15.00]", "Second line")

    def test_metadata_lines(self):
        lrc = "[ar:Artist Name]\n[ti:Song Title]\n[00:01.00] Lyrics"
        pairs = _parse_lrc(lrc)
        assert pairs[0] == ("[ar:Artist Name]", "")
        assert pairs[1] == ("[ti:Song Title]", "")
        assert pairs[2] == ("[00:01.00]", "Lyrics")

    def test_empty_lines(self):
        lrc = "[00:01.00] First\n\n[00:05.00] Second"
        pairs = _parse_lrc(lrc)
        assert len(pairs) == 3
        assert pairs[1] == ("", "")

    def test_timestamp_without_text(self):
        lrc = "[00:01.00] \n[00:02.00] Word"
        pairs = _parse_lrc(lrc)
        assert pairs[0] == ("[00:01.00]", "")
        assert pairs[1] == ("[00:02.00]", "Word")

    def test_millisecond_timestamps(self):
        lrc = "[01:23.456] Long timestamp"
        pairs = _parse_lrc(lrc)
        assert pairs[0][0] == "[01:23.456]"
        assert pairs[0][1] == "Long timestamp"


class TestReassemble:
    def test_roundtrip(self):
        original = "[00:12.34] Hello world\n[00:15.00] Second line"
        pairs = _parse_lrc(original)
        result = _reassemble(pairs)
        assert result == original

    def test_metadata_preserved(self):
        pairs = [("[ar:Artist]", ""), ("[00:01.00]", "Lyrics")]
        result = _reassemble(pairs)
        assert result == "[ar:Artist]\n[00:01.00] Lyrics"

    def test_empty_lines_preserved(self):
        pairs = [("[00:01.00]", "First"), ("", ""), ("[00:05.00]", "Second")]
        result = _reassemble(pairs)
        assert result == "[00:01.00] First\n\n[00:05.00] Second"


class TestTranslateTexts:
    @pytest.mark.asyncio
    async def test_no_key_raises(self):
        """Without DEEPL_KEY, translate_texts should raise TranslationError."""
        from tidal_dl_ru.core.translate import TranslationError, translate_texts

        # Only test if key is not set (CI/dev environment).
        import os
        if os.environ.get("TIDALDLRU_DEEPL_KEY"):
            pytest.skip("DEEPL_KEY is set, skipping error test")

        with pytest.raises(TranslationError, match="TIDALDLRU_DEEPL_KEY"):
            await translate_texts(["hello"])

    @pytest.mark.asyncio
    async def test_empty_input(self):
        """Empty list should return empty list without API call."""
        from tidal_dl_ru.core.translate import translate_texts

        import os
        if not os.environ.get("TIDALDLRU_DEEPL_KEY"):
            pytest.skip("Need DEEPL_KEY for this test")

        result = await translate_texts([])
        assert result == []
