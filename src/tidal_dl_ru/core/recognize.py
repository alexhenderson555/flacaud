"""Audio recognition via AudD API.

Accepts raw audio bytes, sends to AudD, returns recognized track info.
Docs: https://docs.audd.io/
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

AUDD_API = "https://api.audd.io/"
AUDD_TOKEN = os.environ.get("TIDALDLRU_AUDD_TOKEN", "")


@dataclass
class RecognitionResult:
    title: str
    artist: str
    album: Optional[str] = None
    isrc: Optional[str] = None
    release_date: Optional[str] = None


class RecognitionError(Exception):
    pass


async def recognize_audio(audio_bytes: bytes, content_type: str = "audio/ogg") -> Optional[RecognitionResult]:
    """Recognize audio using ShazamAPI (free, reverse engineered API)."""
    import asyncio

    from ShazamAPI import Shazam

    def _run_shazam():
        try:
            import io

            from pydub import AudioSegment

            audio_io = io.BytesIO(audio_bytes)

            # Extract format from content_type, e.g., 'audio/webm;codecs=opus' -> 'webm'
            fmt = "webm"
            if "ogg" in content_type: fmt = "ogg"
            elif "mp4" in content_type: fmt = "mp4"
            elif "wav" in content_type: fmt = "wav"

            try:
                seg = AudioSegment.from_file(audio_io, format=fmt)
            except Exception as e:
                print(f"Warning: failed to decode as {fmt}, trying auto-guess. Error: {e}")
                audio_io.seek(0)
                seg = AudioSegment.from_file(audio_io)

            out_io = io.BytesIO()
            seg.export(out_io, format="mp3")
            mp3_bytes = out_io.getvalue()

            shazam = Shazam(mp3_bytes)
            recognize_generator = shazam.recognizeSong()
            return next(recognize_generator)
        except StopIteration:
            return None
        except Exception as e:
            raise RecognitionError(f"ShazamAPI error: {e}")

    response = await asyncio.to_thread(_run_shazam)

    print("Shazam API raw response length:", len(response) if response else 0)

    if not response or len(response) < 2:
        return None

    data = response[1]

    if "matches" not in data or not data["matches"]:
        print("Shazam found no matches. Possibly too quiet or not enough audio.")
        return None

    track = data.get("track")
    if not track:
        return None

    # Shazam API structure
    title = track.get("title", "")
    artist = track.get("subtitle", "") # Artist name is typically in subtitle
    isrc = track.get("isrc")

    album = ""
    sections = track.get("sections", [])
    for section in sections:
        if section.get("type") == "SONG":
            metadata = section.get("metadata", [])
            for item in metadata:
                if item.get("title") == "Album":
                    album = item.get("text", "")
                    break

    return RecognitionResult(
        title=title,
        artist=artist,
        album=album,
        isrc=isrc
    )
