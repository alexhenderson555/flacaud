from pathlib import Path

from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4


def read_bpm_key(path: Path):
    ext = path.suffix.lower()
    bpm, key = None, None
    try:
        if ext == ".flac":
            audio = FLAC(path)
            if "BPM" in audio:
                bpm = float(audio["BPM"][0])
            if "INITIALKEY" in audio:
                key = audio["INITIALKEY"][0]
        elif ext in (".m4a", ".mp4"):
            audio = MP4(path)
            if "tmpo" in audio:
                bpm = float(audio["tmpo"][0])
            key_tag = "----:com.apple.iTunes:INITIALKEY"
            if key_tag in audio:
                key = audio[key_tag][0].decode("utf-8")
        elif ext == ".mp3":
            audio = ID3(path)
            if "TBPM" in audio:
                bpm = float(audio["TBPM"].text[0])
            if "TKEY" in audio:
                key = audio["TKEY"].text[0]
    except Exception as e:
        print(f"Error reading tags: {e}")
    return bpm, key
