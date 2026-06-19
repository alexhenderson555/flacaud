import json
from pathlib import Path

from tidal_dl_ru.server.search_typo import MUSIC_VOCAB

_VOCAB_FILE = Path(__file__).resolve().parents[1] / "shared" / "music_vocab.json"


def test_music_vocab_loaded_from_shared_json():
    on_disk = json.loads(_VOCAB_FILE.read_text(encoding="utf-8"))
    assert isinstance(on_disk, list)
    assert len(on_disk) >= 20
    assert "Major Lazer" in on_disk
    assert "Major Lazer" in MUSIC_VOCAB
    assert len(MUSIC_VOCAB) == len(set(t.lower() for t in MUSIC_VOCAB))
