"""Tests for core.dj — DJ analysis utilities."""

import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from tidal_dl_ru.core.dj import (
    _CAMELOT,
    _OPENKEY,
    camelot_key,
    export_rekordbox_xml,
    openkey,
)


class TestCamelotKey:
    def test_major_keys(self):
        assert camelot_key("C major") == "8B"
        assert camelot_key("A major") == "11B"
        assert camelot_key("G major") == "9B"

    def test_minor_keys(self):
        assert camelot_key("A minor") == "8A"
        assert camelot_key("D minor") == "7A"
        assert camelot_key("E minor") == "9A"

    def test_unknown_key_passthrough(self):
        assert camelot_key("X unknown") == "X unknown"

    def test_all_24_keys_mapped(self):
        assert len(_CAMELOT) == 24


class TestOpenKey:
    def test_major_keys(self):
        assert openkey("C major") == "1d"
        assert openkey("G major") == "2d"

    def test_minor_keys(self):
        assert openkey("A minor") == "4m"
        assert openkey("C minor") == "1m"

    def test_all_24_keys_mapped(self):
        assert len(_OPENKEY) == 24


class TestRekordboxExport:
    def test_basic_export(self):
        tracks = [
            {
                "path": "/music/track1.flac",
                "title": "Track One",
                "artist": "Artist A",
                "album": "Album X",
                "bpm": 128.0,
                "key": "8B",
                "duration_s": 240,
            },
            {
                "path": "/music/track2.flac",
                "title": "Track Two",
                "artist": "Artist B",
                "album": "",
                "bpm": None,
                "key": None,
            },
        ]

        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
            out_path = Path(f.name)

        try:
            result = export_rekordbox_xml(tracks, out_path)
            assert result == out_path
            assert out_path.exists()

            tree = ET.parse(out_path)
            root = tree.getroot()
            assert root.tag == "DJ_PLAYLISTS"
            assert root.get("Version") == "1.0.0"

            collection = root.find("COLLECTION")
            assert collection is not None
            assert collection.get("Entries") == "2"

            track_els = collection.findall("TRACK")
            assert len(track_els) == 2

            t1 = track_els[0]
            assert t1.get("Name") == "Track One"
            assert t1.get("Artist") == "Artist A"
            assert t1.get("AverageBpm") == "128.0"
            assert t1.get("Tonality") == "8B"
            assert t1.get("TotalTime") == "240"

            t2 = track_els[1]
            assert t2.get("Name") == "Track Two"
            assert t2.get("AverageBpm") is None
            assert t2.get("Tonality") is None
        finally:
            out_path.unlink(missing_ok=True)

    def test_empty_collection(self):
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
            out_path = Path(f.name)

        try:
            export_rekordbox_xml([], out_path)
            tree = ET.parse(out_path)
            collection = tree.getroot().find("COLLECTION")
            assert collection.get("Entries") == "0"
            assert len(collection.findall("TRACK")) == 0
        finally:
            out_path.unlink(missing_ok=True)
