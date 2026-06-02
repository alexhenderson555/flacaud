from __future__ import annotations

from pathlib import Path
from typing import Optional

import httpx
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover

from tidal_dl_ru.core.models import Track


def _fetch_cover(client: httpx.Client, cover_url: Optional[str]) -> Optional[bytes]:
    if not cover_url:
        return None
    try:
        resp = client.get(cover_url, follow_redirects=True)
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    return resp.content


def _title_with_version(track: Track) -> str:
    return track.title + (f" ({track.version})" if track.version else "")


def tag_file(
    path: Path,
    track: Track,
    http: httpx.Client,
    lyrics: Optional[str] = None,
) -> None:
    ext = path.suffix.lower()
    cover = _fetch_cover(http, track.cover_url)
    if ext == ".flac":
        _tag_flac(path, track, cover, lyrics)
    elif ext in (".m4a", ".mp4"):
        _tag_m4a(path, track, cover, lyrics)
    elif ext == ".mp3":
        _tag_mp3(path, track, cover, lyrics)
    # other formats: skip silently — opus/ogg/webm tagging deferred


def _tag_flac(
    path: Path, track: Track, cover: Optional[bytes], lyrics: Optional[str]
) -> None:
    audio = FLAC(path)
    audio["title"] = _title_with_version(track)
    audio["artist"] = ", ".join(track.artists)
    if track.album_artist:
        audio["albumartist"] = track.album_artist
    if track.album:
        audio["album"] = track.album
    if track.release_date:
        audio["date"] = track.release_date
    audio["tracknumber"] = str(track.track_number)
    audio["discnumber"] = str(track.disc_number)
    if track.isrc:
        audio["isrc"] = track.isrc
    if track.copyright_:
        audio["copyright"] = track.copyright_
    if lyrics:
        audio["lyrics"] = lyrics
    if cover:
        audio.clear_pictures()
        pic = Picture()
        pic.data = cover
        pic.type = 3
        pic.mime = "image/jpeg"
        pic.width = 640
        pic.height = 640
        audio.add_picture(pic)
    audio.save()


def _tag_m4a(
    path: Path, track: Track, cover: Optional[bytes], lyrics: Optional[str]
) -> None:
    audio = MP4(path)
    audio["\xa9nam"] = _title_with_version(track)
    audio["\xa9ART"] = ", ".join(track.artists)
    if track.album_artist:
        audio["aART"] = track.album_artist
    if track.album:
        audio["\xa9alb"] = track.album
    if track.release_date:
        audio["\xa9day"] = track.release_date
    audio["trkn"] = [(track.track_number, track.total_tracks or 0)]
    audio["disk"] = [(track.disc_number, 0)]
    if track.copyright_:
        audio["cprt"] = track.copyright_
    if lyrics:
        audio["\xa9lyr"] = lyrics
    if cover:
        audio["covr"] = [MP4Cover(cover, imageformat=MP4Cover.FORMAT_JPEG)]
    audio.save()


def _tag_mp3(
    path: Path, track: Track, cover: Optional[bytes], lyrics: Optional[str]
) -> None:
    from mutagen.id3 import (
        APIC,
        ID3,
        TALB,
        TDRC,
        TIT2,
        TPE1,
        TPE2,
        TRCK,
        USLT,
        ID3NoHeaderError,
    )

    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()
    tags["TIT2"] = TIT2(encoding=3, text=_title_with_version(track))
    tags["TPE1"] = TPE1(encoding=3, text=", ".join(track.artists))
    if track.album_artist:
        tags["TPE2"] = TPE2(encoding=3, text=track.album_artist)
    if track.album:
        tags["TALB"] = TALB(encoding=3, text=track.album)
    if track.release_date:
        tags["TDRC"] = TDRC(encoding=3, text=track.release_date)
    tags["TRCK"] = TRCK(
        encoding=3,
        text=(
            f"{track.track_number}/{track.total_tracks}"
            if track.total_tracks
            else str(track.track_number)
        ),
    )
    if lyrics:
        tags["USLT::eng"] = USLT(encoding=3, lang="eng", desc="", text=lyrics)
    if cover:
        tags["APIC"] = APIC(
            encoding=3, mime="image/jpeg", type=3, desc="Cover", data=cover
        )
    tags.save(path)
