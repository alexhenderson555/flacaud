"""Tidal audio streaming pipeline (used by the media router's stream/quality routes).

Holds everything behind ``/api/stream/*`` and the quality probes:
- DASH path: segmented FLAC download, parallel fetch, remux to a seekable file, range serving.
- BTS path: progressive/redirect streaming with a local cache.
- Stream resolution + delivered-quality metadata.
- Shared in-process state (``stream_locks``, the dash/bts cache-job maps and resolve cache).

Kept separate from ``routers/media.py`` so the route layer stays thin; the routes
import the helpers they need from here.
"""

import asyncio
import collections
import logging
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from filelock import FileLock, Timeout

from tidal_dl_ru.plan_limits import (
    lossless_flac_allowed,
)
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.manifest_fetch import fetch_playback_manifest
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.server.range_file import ranged_file_response, streaming_part_response
from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)


def _stream_cache_dir() -> Path:
    settings.stream_cache_dir.mkdir(parents=True, exist_ok=True)
    return settings.stream_cache_dir


def _merge_lock_path(target: Path) -> Path:
    return target.with_suffix(target.suffix + ".merge.lock")


def _try_acquire_merge_lock(lock: FileLock) -> bool:
    try:
        lock.acquire(timeout=0)
        return True
    except Timeout:
        return False


def _api_detail(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


class TidalStreamUnavailable(RuntimeError):
    """Raised when Tidal playback manifest cannot be resolved."""

    def __init__(self, message: str, *, rate_limited: bool = False):
        super().__init__(message)
        self.rate_limited = rate_limited


stream_locks = collections.defaultdict(asyncio.Lock)


_dash_cache_jobs: dict[str, asyncio.Task] = {}


_bts_cache_jobs: dict[str, asyncio.Task] = {}


_dash_resolve_cache: dict[str, dict] = {}


_MIN_CACHE_BYTES = 65536


# Minimum bytes buffered before a Range 206 (LOSSLESS DASH); HIGH/BTS uses CDN multi-MB chunks.
_MIN_RANGE_RESPONSE = 512 * 1024


# LOSSLESS/HI_RES DASH: full download + remux before serve (no partial .part playback).
# HIGH/BTS still uses progressive CDN streaming via _proxy_bts_stream.
_FAST_START_BYTES = 96 * 1024


# DASH cache is concatenated fMP4 until ffmpeg remux — never label .part as audio/flac.
_DASH_PART_MEDIA_TYPE = "audio/mp4"


_BTS_INITIAL_RANGE_BYTES = 512 * 1024


_HOP_HEADERS = frozenset(
    {
        "content-encoding",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "upgrade",
    }
)


def _qname(q) -> str:
    return getattr(q, "name", str(q)).upper()


def _dash_total_meta_path(part_path: Path) -> Path:
    return Path(str(part_path) + ".total")


def _read_dash_resource_total(
    part_path: Path,
    merge_path: Path,
    final_path: Path,
) -> int | None:
    if final_path.is_file():
        return final_path.stat().st_size
    if merge_path.is_file():
        return merge_path.stat().st_size
    meta = _dash_total_meta_path(part_path)
    if not meta.is_file():
        return None
    try:
        total = int(meta.read_text(encoding="utf-8").strip())
        return total if total > 0 else None
    except ValueError:
        return None


async def _estimate_dash_total_bytes(urls: list[str]) -> int | None:
    """Estimate total bytes from init + one media segment — avoid HEAD on every slice."""
    if not urls:
        return None

    async def _head_size(client: httpx.AsyncClient, url: str) -> int | None:
        try:
            resp = await client.head(url, follow_redirects=True)
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
        except Exception:
            return None

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        init_size = await _head_size(client, urls[0])
        if init_size is None:
            return None
        if len(urls) == 1:
            return init_size
        media_size = await _head_size(client, urls[1])
        if media_size is None:
            return None
        return init_size + media_size * (len(urls) - 1)


def _dash_cache_lookup_key(track_id: str, q_enum: AudioQuality) -> str:
    return f"{track_id}:{q_enum.name}"


def _stream_cache_keys(q_enum: AudioQuality) -> tuple[str, ...]:
    """Filename tiers for a requested UI quality (manifest actual_quality may differ)."""
    hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    if hi is not None and q_enum == hi:
        return (hi.name, AudioQuality.LOSSLESS.name)
    if q_enum == AudioQuality.LOSSLESS:
        keys = [AudioQuality.LOSSLESS.name]
        if hi is not None:
            keys.append(hi.name)
        return tuple(keys)
    return (q_enum.name,)


def _find_merged_dash_file(cache_dir: Path, track_id: str, q_enum: AudioQuality) -> Path | None:
    """Return remuxed audio only — never intermediate .fmp4 (causes play-then-restart)."""
    for cache_key in _stream_cache_keys(q_enum):
        for ext in _DASH_MEDIA_EXTS:
            path = cache_dir / f"{track_id}_{cache_key}{ext}"
            if path.is_file():
                return path
    return None


def _dash_file_media_type(path: Path) -> str:
    if path.suffix.lower() == ".flac":
        return "audio/flac"
    return "audio/mp4"


async def _resolve_dash_stream_cached(
    p,
    track_id: str,
    q_enum: AudioQuality,
    cache_dir: Path,
    plan: str | None = None,
) -> dict:
    """Resolve Tidal stream once per track+quality; reuse for every Range request."""
    key = _dash_cache_lookup_key(track_id, q_enum)
    hit = _dash_resolve_cache.get(key)
    if hit is not None:
        return hit

    lock = stream_locks[key]
    async with lock:
        hit = _dash_resolve_cache.get(key)
        if hit is not None:
            return hit
        res = await asyncio.to_thread(_resolve_tidal_stream, p, track_id, q_enum, plan)
        if res["type"] == "dash_stream":
            aq = res.get("actual_quality")
            urls, tmp_path, fmp4_path, final_path, file_media_type = _dash_paths_from_manifest(
                res["manifest"], aq, q_enum, track_id, cache_dir,
            )
            hit = {
                "res": res,
                "urls": urls,
                "tmp_path": tmp_path,
                "fmp4_path": fmp4_path,
                "final_path": final_path,
                "file_media_type": file_media_type,
                "actual_quality": aq,
            }
        else:
            hit = {"res": res}
        _dash_resolve_cache[key] = hit
        return hit


_DASH_PARALLEL_SEGMENTS = 16


_DASH_MEDIA_EXTS = (".flac", ".m4a", ".mp4", ".eac3")


def _quality_to_enum(quality: str) -> AudioQuality:
    try:
        if quality.upper() == "HI_RES":
            return getattr(AudioQuality, "HI_RES_LOSSLESS", AudioQuality.LOSSLESS)
        return AudioQuality[quality.upper()]
    except KeyError:
        return AudioQuality.HIGH


def _dash_paths_from_manifest(
    manifest,
    aq,
    q_enum: AudioQuality,
    track_id: str,
    cache_dir: Path,
) -> tuple[list[str], Path, Path, Path, str]:
    from tidal_dl_ru.providers.tidal.download import (
        _decode_manifest,
        _stream_urls_from_dash,
        extension_for,
    )

    decoded = _decode_manifest(manifest)
    urls, codecs = _stream_urls_from_dash(decoded)
    ext = extension_for(codecs, manifest.manifest_mime_type)
    # Use requested tier for paths so _find_merged_dash_file hits on every Range request.
    cache_key = q_enum.name
    fmp4_path = cache_dir / f"{track_id}_{cache_key}.fmp4"
    tmp_path = Path(str(fmp4_path) + ".part")
    final_path = cache_dir / f"{track_id}_{cache_key}{ext}"
    file_media_type = _dash_file_media_type(final_path)
    return urls, tmp_path, fmp4_path, final_path, file_media_type


def _schedule_dash_warm(
    urls: list[str],
    tmp_path: Path,
    fmp4_path: Path,
    final_path: Path,
    bytes_target: int | None = None,
) -> None:
    """Start DASH merge in the background (e.g. while the client probes quality)."""
    if final_path.exists() or final_path.with_suffix(".m4a").exists():
        return
    target = bytes_target if bytes_target is not None else 0
    key = str(fmp4_path)
    task = _dash_cache_jobs.get(key)
    if task is not None and not task.done():
        return

    async def _warm() -> None:
        try:
            await _ensure_dash_cache(urls, tmp_path, fmp4_path, final_path, target)
        except HTTPException:
            pass
        except Exception as exc:
            logger.debug("DASH warm failed for %s: %s", fmp4_path.name, exc)

    asyncio.create_task(_warm())


async def _pipeline_tail_segments(
    client: httpx.AsyncClient,
    urls: list[str],
    cache_f,
    stream_url_to,
    *,
    start_idx: int = 0,
) -> None:
    """Download media segments in parallel; write in order (streamed, not buffered)."""
    if not urls or start_idx >= len(urls):
        return
    sem = asyncio.Semaphore(_DASH_PARALLEL_SEGMENTS)
    done: list[asyncio.Event] = [asyncio.Event() for _ in urls]
    for i in range(start_idx):
        done[i].set()

    async def _fetch_idx(idx: int, url: str) -> None:
        async with sem:
            if idx > 0:
                await done[idx - 1].wait()
            await stream_url_to(client, url, cache_f)
            done[idx].set()

    await asyncio.gather(*(_fetch_idx(i, url) for i, url in enumerate(urls[start_idx:], start_idx)))


async def _download_dash_segments_with_lock(
    lock: FileLock,
    urls: list[str],
    tmp_path: Path,
    fmp4_path: Path,
    final_path: Path,
    *,
    fast_start_bytes: int = 0,
) -> None:
    try:
        await _download_dash_segments(
            urls, tmp_path, fmp4_path, final_path, fast_start_bytes=fast_start_bytes,
        )
    finally:
        if lock.is_locked:
            lock.release()


async def _download_dash_segments(
    urls: list[str],
    tmp_path: Path,
    fmp4_path: Path,
    final_path: Path,
    *,
    fast_start_bytes: int = 0,
) -> None:
    """Init + sequential segments; remux fMP4 to FLAC/M4A when complete."""
    from tidal_dl_ru.providers.tidal.download import _remux

    chunk_size = 512 * 1024
    meta_path = _dash_total_meta_path(tmp_path)

    async def _stream_url_to(client: httpx.AsyncClient, url: str, cache_f) -> None:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            async for block in resp.aiter_bytes(chunk_size=chunk_size):
                cache_f.write(block)

    meta_task = asyncio.create_task(_write_total_meta(urls, meta_path))
    try:
        limits = httpx.Limits(max_connections=4, max_keepalive_connections=4)
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0), limits=limits) as client:
            with tmp_path.open("wb") as cache_f:
                if not urls:
                    return
                await _stream_url_to(client, urls[0], cache_f)
                media_urls = urls[1:]
                head_idx = 0
                while head_idx < len(media_urls):
                    if fast_start_bytes > 0 and tmp_path.stat().st_size >= fast_start_bytes:
                        break
                    await _stream_url_to(client, media_urls[head_idx], cache_f)
                    head_idx += 1
                for url in media_urls[head_idx:]:
                    await _stream_url_to(client, url, cache_f)
        await meta_task
        tmp_path.replace(fmp4_path)
        meta_path.unlink(missing_ok=True)
        await asyncio.to_thread(_remux, fmp4_path, final_path)
        if not final_path.exists():
            fallback = final_path.with_suffix(".m4a")
            if not fallback.is_file():
                raise RuntimeError(f"DASH remux left no file for {final_path.name}")
    except Exception:
        meta_task.cancel()
        tmp_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
        fmp4_path.unlink(missing_ok=True)
        raise


async def _write_total_meta(urls: list[str], meta_path: Path) -> None:
    try:
        estimated = await asyncio.wait_for(_estimate_dash_total_bytes(urls), timeout=15.0)
        if estimated:
            meta_path.write_text(str(estimated), encoding="utf-8")
    except Exception:
        pass


async def _ensure_dash_cache(
    urls: list[str],
    tmp_path: Path,
    fmp4_path: Path,
    final_path: Path,
    bytes_required: int = 0,
) -> Path:
    """Wait until cache can satisfy the request.

    ``bytes_required == 0`` means wait for remuxed FLAC/M4A only (lossless streaming).
    """
    if final_path.is_file():
        return final_path
    fallback = final_path.with_suffix(".m4a")
    if fallback.is_file():
        return fallback

    require_merged = bytes_required == 0
    if not require_merged and fmp4_path.exists():
        return fmp4_path

    key = str(fmp4_path)
    task = _dash_cache_jobs.get(key)
    merge_lock = FileLock(str(_merge_lock_path(fmp4_path)))
    if task is None or task.done():
        if require_merged:
            start_target = 0
        elif bytes_required > 0:
            start_target = max(bytes_required, _FAST_START_BYTES)
        else:
            start_target = _FAST_START_BYTES
        owns_merge = await asyncio.to_thread(_try_acquire_merge_lock, merge_lock)
        if owns_merge:
            _dash_cache_jobs[key] = asyncio.create_task(
                _download_dash_segments_with_lock(
                    merge_lock,
                    urls,
                    tmp_path,
                    fmp4_path,
                    final_path,
                    fast_start_bytes=start_target,
                )
            )
            task = _dash_cache_jobs[key]
        else:
            task = None

    need_partial = bytes_required if bytes_required > 0 else None

    for _ in range(3600):
        if final_path.exists():
            return final_path
        if fallback.exists():
            return fallback
        if not require_merged and fmp4_path.exists():
            return fmp4_path
        if need_partial is not None and tmp_path.exists():
            if tmp_path.stat().st_size >= need_partial:
                return tmp_path
        if task.done():
            if final_path.exists():
                return final_path
            if fallback.exists():
                return fallback
            if not require_merged and fmp4_path.exists():
                return fmp4_path
            err = task.exception()
            if err:
                raise err
            if require_merged:
                # Remux may finish on disk slightly after the asyncio task returns.
                await asyncio.sleep(0.05)
                continue
            break
        await asyncio.sleep(0.02)

    if final_path.exists():
        return final_path
    fallback = final_path.with_suffix(".m4a")
    if fallback.exists():
        return fallback
    if not require_merged and fmp4_path.exists():
        return fmp4_path
    if need_partial is not None and tmp_path.exists() and tmp_path.stat().st_size >= need_partial:
        return tmp_path
    raise HTTPException(
        status_code=504,
        detail=_api_detail("stream_timeout", "Stream cache timeout"),
    )


def _dash_stream_bytes_needed(request: Request) -> int:
    """LOSSLESS/HI_RES DASH — wait for full remux; no partial .part streaming."""
    return 0


def _range_bytes_needed(request: Request) -> int:
    """Bytes cached before respond; 0 means wait for the complete merged file."""
    rh = request.headers.get("range")
    if not rh or not rh.lower().startswith("bytes="):
        return max(_FAST_START_BYTES, _MIN_RANGE_RESPONSE)
    spec = rh.split("=", 1)[1].strip().split(",", 1)[0].strip()
    if spec.startswith("-"):
        # FLAC/MP4 players probe the file tail for duration — need the full merge.
        return 0
    start_s, _, end_s = spec.partition("-")
    try:
        end = int(end_s) if end_s else None
        start = int(start_s) if start_s else 0
    except ValueError:
        return max(_FAST_START_BYTES, _MIN_RANGE_RESPONSE)
    if end is not None:
        span = end - start + 1
        if start == 0 and span < _MIN_RANGE_RESPONSE:
            return max(end + 1, _MIN_RANGE_RESPONSE)
        if span < _MIN_RANGE_RESPONSE and start < 4 * 1024 * 1024:
            return max(end + 1, start + _MIN_RANGE_RESPONSE)
        return max(_MIN_CACHE_BYTES, end + 1)
    if start > 0:
        return max(_MIN_CACHE_BYTES, start + _MIN_RANGE_RESPONSE)
    return max(_FAST_START_BYTES, _MIN_RANGE_RESPONSE)


def _cap_bts_range(range_header: str | None) -> str:
    """Limit open-ended byte=0- probes so playback can start before the full AAC file."""
    if not range_header or not range_header.lower().startswith("bytes="):
        return f"bytes=0-{_BTS_INITIAL_RANGE_BYTES - 1}"
    spec = range_header.split("=", 1)[1].strip().split(",", 1)[0].strip()
    if spec.startswith("-"):
        return range_header
    start_s, _, end_s = spec.partition("-")
    if end_s == "" and start_s in ("0", ""):
        return f"bytes=0-{_BTS_INITIAL_RANGE_BYTES - 1}"
    if start_s == "0" and end_s.isdigit() and int(end_s) >= _BTS_INITIAL_RANGE_BYTES:
        return f"bytes=0-{_BTS_INITIAL_RANGE_BYTES - 1}"
    return range_header


def _requires_full_file_before_play(q_enum: AudioQuality) -> bool:
    """LOSSLESS/HI_RES must be cached completely; HIGH stays progressive BTS."""
    return q_enum != AudioQuality.HIGH


def _bts_cache_ext(url: str) -> str:
    path = urlparse(url).path.lower()
    if ".flac" in path:
        return ".flac"
    if ".m4a" in path or ".mp4" in path:
        return ".m4a"
    return ".flac"


def _bts_cache_path(cache_dir: Path, track_id: str, q_enum: AudioQuality, url: str) -> Path:
    return cache_dir / f"{track_id}_{q_enum.name}{_bts_cache_ext(url)}"


def _bts_size_meta_path(dest: Path) -> Path:
    return Path(str(dest) + ".size")


def _read_bts_size_meta(dest: Path) -> int | None:
    meta = _bts_size_meta_path(dest)
    if not meta.is_file():
        return None
    try:
        value = int(meta.read_text(encoding="utf-8").strip())
        return value if value > 0 else None
    except ValueError:
        return None


async def _head_bts_total_bytes(url: str) -> int | None:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
            resp = await client.head(url)
            resp.raise_for_status()
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
    except Exception:
        return None


def _range_start_from_request(request: Request) -> int:
    rh = request.headers.get("range")
    if not rh or not rh.lower().startswith("bytes="):
        return 0
    spec = rh.split("=", 1)[1].strip().split(",", 1)[0].strip()
    if spec.startswith("-"):
        return 0
    start_s, _, _ = spec.partition("-")
    try:
        return int(start_s) if start_s else 0
    except ValueError:
        return 0


async def _download_bts_to_path(url: str, dest: Path) -> None:
    tmp = Path(str(dest) + ".part")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                with tmp.open("wb") as out:
                    async for chunk in resp.aiter_bytes(chunk_size=512 * 1024):
                        out.write(chunk)
        if not tmp.is_file() or tmp.stat().st_size <= 0:
            raise RuntimeError(f"BTS cache empty for {dest.name}")
        tmp.replace(dest)
        _bts_size_meta_path(dest).unlink(missing_ok=True)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


async def _download_bts_to_path_with_lock(lock: FileLock, url: str, dest: Path) -> None:
    try:
        await _download_bts_to_path(url, dest)
    finally:
        if lock.is_locked:
            lock.release()


async def _ensure_bts_cache(url: str, dest: Path) -> Path:
    if dest.is_file() and dest.stat().st_size > 0:
        return dest
    key = str(dest)
    task = _bts_cache_jobs.get(key)
    merge_lock = FileLock(str(_merge_lock_path(dest)))
    if task is None or task.done():
        owns_merge = await asyncio.to_thread(_try_acquire_merge_lock, merge_lock)
        if owns_merge:
            _bts_cache_jobs[key] = asyncio.create_task(
                _download_bts_to_path_with_lock(merge_lock, url, dest),
            )
            task = _bts_cache_jobs[key]
        else:
            task = None
    for _ in range(36000):
        if dest.is_file() and dest.stat().st_size > 0:
            return dest
        if task.done():
            err = task.exception()
            if err:
                raise err
            if dest.is_file() and dest.stat().st_size > 0:
                return dest
            break
        await asyncio.sleep(0.05)
    raise HTTPException(
        status_code=504,
        detail=_api_detail("stream_timeout", "Stream cache timeout"),
    )


def _schedule_bts_warm(url: str, dest: Path) -> None:
    if dest.is_file() and dest.stat().st_size > 0:
        return
    key = str(dest)
    task = _bts_cache_jobs.get(key)
    if task is not None and not task.done():
        return

    async def _warm() -> None:
        try:
            if _read_bts_size_meta(dest) is None:
                total = await _head_bts_total_bytes(url)
                if total:
                    _bts_size_meta_path(dest).write_text(str(total), encoding="utf-8")
            await _ensure_bts_cache(url, dest)
        except HTTPException:
            pass
        except Exception as exc:
            logger.debug("BTS warm failed for %s: %s", dest.name, exc)

    asyncio.create_task(_warm())


async def _serve_bts_progressive(
    url: str,
    cache_path: Path,
    request: Request,
    extra_headers: dict,
) -> Response | FileResponse | StreamingResponse:
    """Serve 320k BTS from local cache when possible — instant seek within buffered bytes."""
    _schedule_bts_warm(url, cache_path)
    if cache_path.is_file() and cache_path.stat().st_size > 0:
        return ranged_file_response(
            cache_path,
            request,
            _dash_file_media_type(cache_path),
            extra_headers,
        )

    part_path = Path(str(cache_path) + ".part")
    range_start = _range_start_from_request(request)
    bytes_needed = max(_range_bytes_needed(request), range_start + _MIN_RANGE_RESPONSE)
    if part_path.is_file() and part_path.stat().st_size >= bytes_needed:
        total = _read_bts_size_meta(cache_path)
        return await streaming_part_response(
            part_path,
            cache_path,
            request,
            _dash_file_media_type(cache_path),
            extra_headers,
            resource_total=total,
        )

    return await _proxy_bts_stream(url, request, extra_headers)


_bts_proxy_client: httpx.AsyncClient | None = None


def _bts_proxy_http() -> httpx.AsyncClient:
    global _bts_proxy_client
    if _bts_proxy_client is None or _bts_proxy_client.is_closed:
        _bts_proxy_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0),
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
        )
    return _bts_proxy_client


async def _proxy_bts_stream(url: str, request: Request, extra_headers: dict) -> StreamingResponse:
    req_headers: dict[str, str] = {"Range": _cap_bts_range(request.headers.get("range"))}

    client = _bts_proxy_http()
    upstream = await client.send(client.build_request("GET", url, headers=req_headers), stream=True)

    headers = {k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_HEADERS}
    headers["Accept-Ranges"] = "bytes"
    headers["Access-Control-Allow-Origin"] = "*"
    headers["Access-Control-Expose-Headers"] = (
        "Content-Range, Accept-Ranges, X-Actual-Quality, "
        "X-Sample-Rate, X-Bit-Depth, Content-Length"
    )
    headers.update(extra_headers)

    status = upstream.status_code if upstream.status_code in (200, 206) else 206

    async def _stream_generator():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=256 * 1024):
                yield chunk
        finally:
            await upstream.aclose()

    media_type = headers.get("content-type", "audio/mp4")
    return StreamingResponse(
        _stream_generator(),
        status_code=status,
        headers=headers,
        media_type=media_type,
    )


def _stream_quality_candidates(q_enum: AudioQuality) -> list[AudioQuality]:
    """Tiers to try for streaming — LOSSLESS may escalate to HI_RES for real FLAC."""
    hi = getattr(AudioQuality, "HI_RES_LOSSLESS", None)
    if hi is not None and q_enum == hi:
        return [hi, AudioQuality.LOSSLESS]
    if q_enum == AudioQuality.LOSSLESS:
        out = [AudioQuality.LOSSLESS]
        if hi is not None:
            out.append(hi)
        return out
    return [AudioQuality.HIGH]


def _manifest_delivers_lossless(manifest, plan: str | None) -> bool:
    from tidal_dl_ru.providers.tidal.download import manifest_inspect

    try:
        info = manifest_inspect(manifest)
    except Exception:
        return False
    codecs = (info.get("codecs") or "").lower()
    if "flac" not in codecs:
        return False
    return lossless_flac_allowed(manifest, plan)


def _manifest_acceptable_for_request(
    manifest,
    q_enum: AudioQuality,
    plan: str | None,
) -> bool:
    if q_enum == AudioQuality.HIGH:
        return True
    return _manifest_delivers_lossless(manifest, plan)


def _resolve_tidal_stream(
    p,
    track_id: str,
    q_enum: AudioQuality,
    plan: str | None = None,
) -> dict:
    import base64
    import json

    candidates = _stream_quality_candidates(q_enum)
    dash_manifest = None
    dash_quality = None
    saw_rate_limit = False

    for q in candidates:
        manifest, rate_limited = fetch_playback_manifest(track_id, q)
        if rate_limited:
            saw_rate_limit = True
        if manifest is None:
            continue

        if q != AudioQuality.HIGH and not _manifest_acceptable_for_request(
            manifest, q, plan
        ):
            continue

        if manifest.manifest_mime_type == "application/vnd.tidal.bts":
            raw = base64.b64decode(manifest.manifest)
            data = json.loads(raw)
            urls = data.get("urls", [])
            if urls:
                return {"type": "redirect", "url": urls[0], "actual_quality": manifest.audio_quality}

        if manifest.manifest_mime_type == "application/dash+xml" and dash_manifest is None:
            dash_manifest = manifest
            dash_quality = manifest.audio_quality

    if dash_manifest is not None:
        return {"type": "dash_stream", "manifest": dash_manifest, "actual_quality": dash_quality}

    cache_dir = _stream_cache_dir()
    with p._client() as c:
        for q in reversed(candidates):
            manifest, rate_limited = fetch_playback_manifest(track_id, q)
            if rate_limited:
                saw_rate_limit = True
            if manifest is None:
                continue
            try:
                if q != AudioQuality.HIGH and not _manifest_acceptable_for_request(
                    manifest, q, plan
                ):
                    continue
                tmp_dest = cache_dir / f"{track_id}_{q.name}"
                final_path = download_track(c._http, manifest, tmp_dest)
                return {"type": "file", "path": final_path, "actual_quality": manifest.audio_quality}
            except Exception as exc:
                logger.debug("Download failed for quality %s: %s", q, exc)
                continue

    if saw_rate_limit:
        raise TidalStreamUnavailable(
            "Tidal rate limited playback manifest",
            rate_limited=True,
        )
    raise TidalStreamUnavailable("No playable stream for requested quality")


def _delivered_stream_meta(
    track_id: str,
    ui_quality: str,
    plan: str | None = None,
    client=None,
) -> dict:
    """Resolve manifest for UI tier and return delivered codec metadata.

    ``client`` (optional) fetches manifests through a specific Tidal client;
    when omitted, fetches rotate through the shared account pool.
    """
    try:
        q_enum = _quality_to_enum(ui_quality)
    except Exception:
        q_enum = AudioQuality.HIGH

    for q in _stream_quality_candidates(q_enum):
        manifest, _ = fetch_playback_manifest(track_id, q, client=client)
        if manifest is None:
            continue
        if q != AudioQuality.HIGH and not _manifest_acceptable_for_request(
            manifest, q, plan
        ):
            continue
        from tidal_dl_ru.providers.tidal.download import manifest_inspect

        try:
            info = manifest_inspect(manifest)
        except Exception:
            info = {}
        codecs = (info.get("codecs") or "").lower()
        aq = manifest.audio_quality
        if "flac" in codecs:
            from tidal_dl_ru.providers.tidal.download import manifest_lossless_meta

            sample_rate, bit_depth = manifest_lossless_meta(manifest)
            return {
                "quality": _qname(aq),
                "sample_rate": sample_rate,
                "bit_depth": bit_depth,
            }
        if q_enum == AudioQuality.HIGH or "mp4a" in codecs or "aac" in codecs:
            return {"quality": _qname(aq) if aq else "HIGH", "sample_rate": None, "bit_depth": None}
    return {"quality": "HIGH", "sample_rate": None, "bit_depth": None}
