"""DJ pipeline — BPM detection, musical key analysis, tagging.

Uses aubio (optional) for tempo detection and a chroma-based approach for key.
Falls back to ffmpeg-based onset detection when aubio is not installed.
Writes BPM and INITIALKEY tags into FLAC/M4A files.
Optionally exports a Rekordbox-compatible XML collection.

Core dependency: numpy. Optional: aubio (pip install tidal-dl-ru[dj]).
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

try:
    import aubio as _aubio  # type: ignore[import-untyped]
except ImportError:
    _aubio = None  # type: ignore[assignment]

# ── Key detection constants ──────────────────────────────────────

# Krumhansl-Kessler key profiles (major & minor).
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)

_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Camelot wheel mapping for DJ-friendly notation.
_CAMELOT = {
    "C major": "8B",  "Db major": "3B", "D major": "10B", "Eb major": "5B",
    "E major": "12B", "F major": "7B",  "F# major": "2B", "G major": "9B",
    "Ab major": "4B", "A major": "11B", "Bb major": "6B", "B major": "1B",
    "C minor": "5A",  "Db minor": "12A","D minor": "7A",  "Eb minor": "2A",
    "E minor": "9A",  "F minor": "4A",  "F# minor": "11A","G minor": "6A",
    "Ab minor": "1A", "A minor": "8A",  "Bb minor": "3A", "B minor": "10A",
}

# Open-key notation (alternative to Camelot).
_OPENKEY = {
    "C major": "1d",  "Db major": "8d", "D major": "3d",  "Eb major": "10d",
    "E major": "5d",  "F major": "12d", "F# major": "7d", "G major": "2d",
    "Ab major": "9d", "A major": "4d",  "Bb major": "11d","B major": "6d",
    "C minor": "1m",  "Db minor": "8m", "D minor": "3m",  "Eb minor": "10m",
    "E minor": "5m",  "F minor": "12m", "F# minor": "7m", "G minor": "2m",
    "Ab minor": "9m", "A minor": "4m",  "Bb minor": "11m","B minor": "6m",
}


# ── BPM detection ───────────────────────────────────────────────

def detect_bpm(audio_path: Path) -> Optional[float]:
    """Detect BPM of an audio file. Uses aubio if available, else ffmpeg fallback."""
    if _aubio is not None:
        return _detect_bpm_aubio(audio_path)
    return _detect_bpm_ffmpeg(audio_path)


def _detect_bpm_aubio(audio_path: Path) -> Optional[float]:
    """BPM detection via aubio (high quality)."""
    src = _aubio.source(str(audio_path), samplerate=0, hop_size=512)
    samplerate = src.samplerate
    tempo = _aubio.tempo("default", 1024, 512, samplerate)

    beats: list[float] = []
    total_read = 0
    while True:
        samples, read = src()
        is_beat = tempo(samples)
        if is_beat[0] != 0:
            beats.append(total_read / samplerate)
        total_read += read
        if read < 512:
            break

    if len(beats) < 4:
        return round(tempo.get_bpm(), 1) if tempo.get_bpm() > 0 else None

    intervals = np.diff(beats)
    valid = intervals[(intervals > 0.3) & (intervals < 1.0)]
    if len(valid) < 2:
        bpm = tempo.get_bpm()
        return round(bpm, 1) if bpm > 0 else None

    median_interval = float(np.median(valid))
    bpm = 60.0 / median_interval
    return round(bpm, 1)


def _detect_bpm_ffmpeg(audio_path: Path) -> Optional[float]:
    """BPM detection via ffmpeg energy-based onset detection (fallback).

    Decodes audio to raw PCM, computes energy in short windows,
    finds peaks (onsets), and estimates tempo from inter-onset intervals.
    """
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return None

    try:
        result = subprocess.run(
            [
                ffmpeg, "-i", str(audio_path),
                "-ac", "1",           # mono
                "-ar", "22050",       # 22kHz sample rate
                "-f", "s16le",        # raw 16-bit PCM
                "-t", "120",          # first 2 minutes only
                "-v", "quiet",
                "pipe:1",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            return None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None

    raw = result.stdout
    if len(raw) < 4410:  # less than 0.1s of audio
        return None

    # Convert to numpy array.
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    samples /= 32768.0  # normalize

    # Compute energy in 50ms windows (1102 samples at 22050Hz).
    sr = 22050
    win_size = int(sr * 0.05)
    hop = win_size // 2
    n_frames = (len(samples) - win_size) // hop
    if n_frames < 10:
        return None

    energy = np.array([
        np.sum(samples[i * hop : i * hop + win_size] ** 2)
        for i in range(n_frames)
    ])

    # Onset detection: find peaks in energy derivative.
    diff = np.diff(energy)
    diff = np.maximum(diff, 0)  # only positive changes (onsets)

    threshold = np.mean(diff) + 1.5 * np.std(diff)
    peaks = np.where(diff > threshold)[0]

    if len(peaks) < 4:
        return None

    # Convert peak indices to times.
    peak_times = peaks * (hop / sr)
    intervals = np.diff(peak_times)

    # Filter to reasonable BPM range (60-200 BPM → 0.3-1.0s intervals).
    valid = intervals[(intervals > 0.3) & (intervals < 1.0)]
    if len(valid) < 3:
        return None

    median_interval = float(np.median(valid))
    bpm = 60.0 / median_interval
    return round(bpm, 1)


# ── Key detection ───────────────────────────────────────────────

def _compute_chroma(audio_path: Path) -> Optional[np.ndarray]:
    """Compute a 12-bin chroma vector from an audio file.

    Uses aubio if available, otherwise decodes via ffmpeg + numpy FFT.
    """
    if _aubio is not None:
        return _compute_chroma_aubio(audio_path)
    return _compute_chroma_ffmpeg(audio_path)


def _compute_chroma_aubio(audio_path: Path) -> Optional[np.ndarray]:
    """Chroma via aubio phase vocoder."""
    win_size = 4096
    hop_size = 512
    src = _aubio.source(str(audio_path), samplerate=0, hop_size=hop_size)
    samplerate = src.samplerate
    pv = _aubio.pvoc(win_size, hop_size)

    chroma_sum = np.zeros(12)
    n_frames = 0

    freqs = np.linspace(0, samplerate / 2, win_size // 2 + 1)
    valid_idx = (freqs >= 60) & (freqs <= 5000)
    valid_freqs = freqs[valid_idx]
    midi = 69 + 12 * np.log2(valid_freqs / 440.0)
    pitch_classes = np.round(midi).astype(int) % 12

    while True:
        samples, read = src()
        spectrum = pv(samples)
        magnitudes = spectrum.norm

        valid_mags = magnitudes[valid_idx] ** 2
        np.add.at(chroma_sum, pitch_classes, valid_mags)

        n_frames += 1
        if read < hop_size:
            break

    if n_frames == 0:
        return None
    return chroma_sum / n_frames


def _compute_chroma_ffmpeg(audio_path: Path) -> Optional[np.ndarray]:
    """Chroma via ffmpeg decode + numpy FFT (fallback)."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return None

    try:
        result = subprocess.run(
            [
                ffmpeg, "-i", str(audio_path),
                "-ac", "1", "-ar", "22050",
                "-f", "s16le", "-t", "60",  # first minute
                "-v", "quiet", "pipe:1",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            return None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None

    raw = result.stdout
    if len(raw) < 4410:
        return None

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    samples /= 32768.0

    sr = 22050
    win_size = 4096
    hop_size = 512
    chroma_sum = np.zeros(12)
    n_frames = 0

    freqs = np.fft.rfftfreq(win_size, 1/sr)
    valid_idx = (freqs >= 60) & (freqs <= 5000)
    valid_freqs = freqs[valid_idx]
    midi = 69 + 12 * np.log2(valid_freqs / 440.0)
    pitch_classes = np.round(midi).astype(int) % 12
    window = np.hanning(win_size)

    for start in range(0, len(samples) - win_size, hop_size):
        frame = samples[start : start + win_size]
        windowed = frame * window
        spectrum = np.abs(np.fft.rfft(windowed))

        valid_mags = spectrum[valid_idx] ** 2
        np.add.at(chroma_sum, pitch_classes, valid_mags)

        n_frames += 1

    if n_frames == 0:
        return None
    return chroma_sum / n_frames


def detect_key(audio_path: Path) -> Optional[str]:
    """Detect musical key. Returns e.g. 'C major', 'A minor', or None."""
    chroma = _compute_chroma(audio_path)
    if chroma is None:
        return None

    # Normalize chroma.
    norm = np.linalg.norm(chroma)
    if norm < 1e-6:
        return None
    chroma = chroma / norm

    best_corr = -2.0
    best_key = ""

    for shift in range(12):
        # Rotate profile to match each key.
        major_rotated = np.roll(_MAJOR_PROFILE, shift)
        minor_rotated = np.roll(_MINOR_PROFILE, shift)

        # Normalize profiles.
        major_norm = major_rotated / np.linalg.norm(major_rotated)
        minor_norm = minor_rotated / np.linalg.norm(minor_rotated)

        corr_major = float(np.dot(chroma, major_norm))
        corr_minor = float(np.dot(chroma, minor_norm))

        if corr_major > best_corr:
            best_corr = corr_major
            best_key = f"{_KEY_NAMES[shift]} major"
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = f"{_KEY_NAMES[shift]} minor"

    return best_key or None


def camelot_key(key: str) -> str:
    """Convert 'C major' → '8B' Camelot notation."""
    return _CAMELOT.get(key, key)


def openkey(key: str) -> str:
    """Convert 'C major' → '1d' Open Key notation."""
    return _OPENKEY.get(key, key)


# ── Tagging ─────────────────────────────────────────────────────

def tag_bpm_key(
    audio_path: Path,
    bpm: Optional[float] = None,
    key: Optional[str] = None,
) -> None:
    """Write BPM and INITIALKEY tags into FLAC or M4A file."""
    ext = audio_path.suffix.lower()

    if ext == ".flac":
        _tag_flac_dj(audio_path, bpm, key)
    elif ext in (".m4a", ".mp4"):
        _tag_m4a_dj(audio_path, bpm, key)
    elif ext == ".mp3":
        _tag_mp3_dj(audio_path, bpm, key)


def _tag_flac_dj(path: Path, bpm: Optional[float], key: Optional[str]) -> None:
    from mutagen.flac import FLAC

    audio = FLAC(path)
    if bpm is not None:
        audio["BPM"] = str(bpm)
    if key is not None:
        audio["INITIALKEY"] = key
    audio.save()


def _tag_m4a_dj(path: Path, bpm: Optional[float], key: Optional[str]) -> None:
    from mutagen.mp4 import MP4

    audio = MP4(path)
    if bpm is not None:
        audio["tmpo"] = [int(round(bpm))]
    if key is not None:
        # No standard M4A atom for key — use freeform.
        audio["----:com.apple.iTunes:INITIALKEY"] = key.encode("utf-8")
    audio.save()


def _tag_mp3_dj(path: Path, bpm: Optional[float], key: Optional[str]) -> None:
    from mutagen.id3 import ID3, TBPM, TKEY, ID3NoHeaderError

    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()
    if bpm is not None:
        tags["TBPM"] = TBPM(encoding=3, text=str(int(round(bpm))))
    if key is not None:
        tags["TKEY"] = TKEY(encoding=3, text=key)
    tags.save(path)


# ── Full analysis ───────────────────────────────────────────────

def analyze_and_tag(audio_path: Path) -> dict[str, Optional[str]]:
    """Run full DJ analysis: detect BPM + key, write tags. Returns results dict."""
    bpm = detect_bpm(audio_path)
    key = detect_key(audio_path)

    if bpm is not None or key is not None:
        tag_bpm_key(audio_path, bpm=bpm, key=key)

    return {
        "bpm": str(bpm) if bpm else None,
        "key": key,
        "camelot": camelot_key(key) if key else None,
        "openkey": openkey(key) if key else None,
    }


# ── Rekordbox XML export ────────────────────────────────────────

def export_rekordbox_xml(
    tracks: list[dict],
    output_path: Path,
) -> Path:
    """Export a Rekordbox-compatible XML collection.

    Each dict in `tracks` should have:
      - path: str (absolute file path)
      - title: str
      - artist: str
      - album: str (optional)
      - bpm: float (optional)
      - key: str (optional, e.g. '8B' Camelot)
      - duration_s: int (optional)
    """
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    product = ET.SubElement(root, "PRODUCT", Name="FlacAud", Version="0.1.0")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(tracks)))

    for i, t in enumerate(tracks, 1):
        attrs = {
            "TrackID": str(i),
            "Name": t.get("title", ""),
            "Artist": t.get("artist", ""),
            "Album": t.get("album", ""),
            "Kind": "FLAC File",
            "Location": f"file://localhost/{t['path'].replace(chr(92), '/')}",
        }
        if t.get("bpm"):
            attrs["AverageBpm"] = str(t["bpm"])
        if t.get("key"):
            attrs["Tonality"] = str(t["key"])
        if t.get("duration_s"):
            attrs["TotalTime"] = str(t["duration_s"])

        ET.SubElement(collection, "TRACK", **attrs)

    # Write with XML declaration.
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(str(output_path), encoding="utf-8", xml_declaration=True)
    return output_path

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
        logger.debug("Error reading tags from %s: %s", path, e)
    return bpm, key

