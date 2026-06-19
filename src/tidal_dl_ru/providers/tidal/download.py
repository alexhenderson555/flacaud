from __future__ import annotations

import base64
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Optional

import httpx

from tidal_dl_ru.providers.tidal.models import PlaybackManifest

ProgressCb = Callable[[int, Optional[int]], None]


class UnsupportedManifest(Exception):
    pass


class EncryptedStream(Exception):
    """Stream requires DRM decryption we don't support (Widevine / encrypted DASH)."""


def _decode_manifest(m: PlaybackManifest) -> dict | ET.Element:
    raw = base64.b64decode(m.manifest)
    mime = m.manifest_mime_type
    if mime == "application/vnd.tidal.bts":
        return json.loads(raw)
    if mime == "application/dash+xml":
        return ET.fromstring(raw)
    raise UnsupportedManifest(f"manifestMimeType={mime!r} not handled")


def _stream_urls_from_dash(root: ET.Element) -> tuple[list[str], str]:
    """Return (segment_urls, codecs) from a DASH manifest."""
    ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
    repr_el = root.find(".//mpd:Representation", ns)
    if repr_el is None:
        raise UnsupportedManifest("no Representation in DASH manifest")
    codecs = repr_el.get("codecs", "")
    template = repr_el.find("mpd:SegmentTemplate", ns)
    if template is None:
        # SegmentList fallback — fairly rare for Tidal
        urls = [s.get("media") for s in repr_el.findall(".//mpd:SegmentURL", ns)]
        return [u for u in urls if u], codecs

    init = template.get("initialization", "")
    media = template.get("media", "")
    start_number = int(template.get("startNumber", "1"))
    timeline = template.find("mpd:SegmentTimeline", ns)
    count = 0
    if timeline is not None:
        for s in timeline.findall("mpd:S", ns):
            count += 1 + int(s.get("r", "0"))
    else:
        # No timeline — derive from duration / segment duration
        duration_attr = template.get("duration")
        if duration_attr:
            timescale = int(template.get("timescale", "1"))
            seg_dur = int(duration_attr) / timescale
            period = root.find("mpd:Period", ns)
            total = float(period.get("duration", "PT0S").lstrip("PT").rstrip("S") or 0)
            count = max(1, int(total / seg_dur) + 1)
        else:
            count = 1

    urls = [init] if init else []
    for i in range(start_number, start_number + count):
        urls.append(media.replace("$Number$", str(i)))
    return urls, codecs


def manifest_lossless_meta(manifest: PlaybackManifest) -> tuple[int | None, int | None]:
    """Sample rate / bit depth from API fields or DASH/BTS manifest body."""
    sr = manifest.sample_rate
    bd = manifest.bit_depth
    if sr and bd:
        return sr, bd
    try:
        decoded = _decode_manifest(manifest)
    except Exception:
        return sr, bd
    if isinstance(decoded, dict):
        if not sr:
            raw_sr = decoded.get("sampleRate") or decoded.get("sample_rate")
            if raw_sr is not None:
                try:
                    sr = int(raw_sr)
                except (TypeError, ValueError):
                    pass
        if not bd:
            raw_bd = decoded.get("bitDepth") or decoded.get("bit_depth")
            if raw_bd is not None:
                try:
                    bd = int(raw_bd)
                except (TypeError, ValueError):
                    pass
        return sr, bd
    ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
    repr_el = decoded.find(".//mpd:Representation", ns)
    if repr_el is not None and not sr:
        rate = repr_el.get("audioSamplingRate")
        if rate:
            try:
                sr = int(rate)
            except (TypeError, ValueError):
                pass
    return sr, bd


def manifest_inspect(manifest: PlaybackManifest) -> dict:
    """Decode manifest — mime, codecs, segment count (DASH FLAC often comes in chunks)."""
    decoded = _decode_manifest(manifest)
    if isinstance(decoded, dict):
        return {
            "kind": "bts",
            "mime": decoded.get("mimeType") or manifest.manifest_mime_type,
            "codecs": decoded.get("codecs", "") or "",
            "segments": len(decoded.get("urls") or []),
            "extension": extension_for(
                decoded.get("codecs", "") or "",
                decoded.get("mimeType", "") or "",
            ),
        }
    urls, codecs = _stream_urls_from_dash(decoded)
    return {
        "kind": "dash",
        "mime": manifest.manifest_mime_type,
        "codecs": codecs or "",
        "segments": len(urls),
        "extension": extension_for(codecs or "", ""),
    }


def extension_for(codecs: str, mime: str) -> str:
    c = codecs.lower()
    if "flac" in c:
        return ".flac"
    if "mp4a" in c or "aac" in c:
        return ".m4a"
    if "mha1" in c or "mhm1" in c:  # MPEG-H 3D Audio (Atmos)
        return ".mp4"
    if "ec-3" in c or "ac-3" in c:
        return ".eac3"
    if "audio/flac" in mime:
        return ".flac"
    return ".m4a"


def download_track(
    client: httpx.Client,
    manifest: PlaybackManifest,
    dest_no_ext: Path,
    on_progress: Optional[ProgressCb] = None,
) -> Path:
    """Download a single track to `dest_no_ext` + appropriate extension. Return final path."""
    decoded = _decode_manifest(manifest)

    if isinstance(decoded, dict):
        # BTS manifest
        encryption = decoded.get("encryptionType", "NONE")
        if encryption != "NONE":
            raise EncryptedStream(
                f"BTS stream is encrypted (encryptionType={encryption!r}); "
                "DRM decryption is not implemented."
            )
        codecs = decoded.get("codecs", "")
        mime = decoded.get("mimeType", "")
        urls = decoded.get("urls", [])
        ext = extension_for(codecs, mime)
        dest = dest_no_ext.with_suffix(ext)
        _stream_to_file(client, urls, dest, on_progress)
        return dest

    # DASH manifest — segments are fMP4; need remux to raw FLAC/M4A
    if _looks_encrypted(decoded):
        raise EncryptedStream("DASH manifest contains ContentProtection — Widevine required.")
    urls, codecs = _stream_urls_from_dash(decoded)
    ext = extension_for(codecs, "")
    # Download into a temp .mp4 first, then remux
    tmp_dest = dest_no_ext.with_suffix(".tmp.mp4")
    _stream_to_file(client, urls, tmp_dest, on_progress)
    if on_progress:
        seg_size = tmp_dest.stat().st_size
        on_progress(seg_size, seg_size)
    dest = dest_no_ext.with_suffix(ext)
    dest = _remux(tmp_dest, dest)
    return dest


def _remux(src: Path, dest: Path) -> Path:
    """Remux fMP4 container to raw FLAC/M4A using ffmpeg. Returns final path."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        # No ffmpeg — keep as .m4a container (playable, but tagging limited)
        fallback = dest.with_suffix(".m4a") if dest.suffix == ".flac" else dest
        src.rename(fallback)
        return fallback
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", str(src), "-c", "copy", str(dest)],
            check=True,
            capture_output=True,
        )
        src.unlink(missing_ok=True)
        return dest
    except subprocess.CalledProcessError:
        # ffmpeg failed — fall back to keeping the mp4 container
        fallback = dest.with_suffix(".m4a") if dest.suffix == ".flac" else dest
        src.rename(fallback)
        return fallback


def _looks_encrypted(root: ET.Element) -> bool:
    ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
    return root.find(".//mpd:ContentProtection", ns) is not None


def _stream_to_file(
    client: httpx.Client,
    urls: list[str],
    dest: Path,
    on_progress: Optional[ProgressCb],
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    total_bytes: Optional[int] = None
    written = 0

    if len(urls) == 1:
        with client.stream("GET", urls[0]) as resp:
            resp.raise_for_status()
            cl = resp.headers.get("content-length")
            total_bytes = int(cl) if cl else None
            with dest.open("wb") as f:
                for chunk in resp.iter_bytes(chunk_size=64 * 1024):
                    f.write(chunk)
                    written += len(chunk)
                    if on_progress:
                        on_progress(written, total_bytes)
        return

    # Multi-segment (DASH): concat as-is. Works for fragmented MP4 (init + media
    # segments). DASH gives no upfront total, so estimate it from the average media
    # segment size — otherwise the UI progress bar would sit at 0% until the very end.
    # urls[0] is the small init segment; the rest are roughly-equal media segments,
    # so it's excluded from the per-segment average to avoid skewing the estimate low.
    n_media = max(1, len(urls) - 1)
    media_written = 0
    media_done = 0
    chunk_size = 256 * 1024

    def _download_segment(url: str) -> bytes:
        parts: list[bytes] = []
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_bytes(chunk_size=chunk_size):
                parts.append(chunk)
        return b"".join(parts)

    with dest.open("wb") as f:
        init_blob = _download_segment(urls[0])
        f.write(init_blob)
        written += len(init_blob)
        if on_progress:
            on_progress(written, total_bytes)

        if len(urls) > 1:
            seg_blobs: list[bytes | None] = [None] * (len(urls) - 1)
            with ThreadPoolExecutor(max_workers=min(8, len(urls) - 1)) as pool:
                future_map = {
                    pool.submit(_download_segment, url): idx
                    for idx, url in enumerate(urls[1:])
                }
                for fut in as_completed(future_map):
                    idx = future_map[fut]
                    seg_blobs[idx] = fut.result()

            for i, blob in enumerate(seg_blobs):
                if blob is None:
                    continue
                seg_start = written
                f.write(blob)
                written += len(blob)
                if on_progress:
                    on_progress(written, total_bytes)
                media_written += written - seg_start
                media_done += 1
                if media_done >= n_media:
                    total_bytes = written
                else:
                    init_bytes = written - media_written
                    total_bytes = init_bytes + round(media_written / media_done * n_media)
            if on_progress:
                on_progress(written, total_bytes)
