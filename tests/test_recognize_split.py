"""Recognize endpoint and demucs split."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.core.split import SplitResult, split_audio_demucs
from tidal_dl_ru.server.app import app


def test_recognize_endpoint(monkeypatch):
    fake = MagicMock()
    fake.artist = "Artist"
    fake.title = "Song"
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.catalog.recognize_audio",
        AsyncMock(return_value=fake),
    )
    mock_provider = MagicMock()
    mock_provider.search.return_value = []
    monkeypatch.setattr(
        "tidal_dl_ru.server.routers.catalog.get_provider_by_name",
        lambda _name: mock_provider,
    )
    with TestClient(app) as client:
        res = client.post(
            "/api/recognize",
            files={"file": ("clip.mp3", b"fake-audio", "audio/mpeg")},
        )
        assert res.status_code == 200


@pytest.mark.asyncio
async def test_split_audio_demucs_success(tmp_path):
    input_file = tmp_path / "in.wav"
    input_file.write_bytes(b"wav")
    out_root = tmp_path / "out"
    out_root.mkdir()
    stem_dir = out_root / "htdemucs" / "in"
    stem_dir.mkdir(parents=True)
    (stem_dir / "vocals.mp3").write_bytes(b"v")
    (stem_dir / "no_vocals.mp3").write_bytes(b"i")

    proc = AsyncMock()
    proc.communicate = AsyncMock(return_value=(b"", b""))
    proc.returncode = 0

    with patch("tidal_dl_ru.core.split.asyncio.create_subprocess_exec", return_value=proc):
        result = await split_audio_demucs(str(input_file), str(out_root))

    assert isinstance(result, SplitResult)
    assert result.vocals_path.endswith("vocals.mp3")
    assert result.instrumental_path.endswith("no_vocals.mp3")
