"""Byte-range responses for seekable cached audio (Spotify-style scrubbing)."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

_PART_READ_CHUNK = 512 * 1024
_PART_POLL_SEC = 0.015


def parse_byte_range(
    range_header: str,
    available_size: int,
    *,
    resource_total: int | None = None,
) -> tuple[int, int]:
    """Parse a Range header.

    ``available_size`` is bytes on disk now. ``resource_total`` is the full asset size
    when still downloading — required so seeks past the buffer are not clamped to EOF.
    """
    if not range_header.lower().startswith("bytes="):
        raise ValueError("bad range")
    spec = range_header.split("=", 1)[1].strip()
    if "," in spec:
        spec = spec.split(",", 1)[0].strip()

    total = (
        resource_total
        if resource_total and resource_total > available_size
        else available_size
    )
    if total <= 0:
        return 0, 0

    if spec.startswith("-"):
        suffix = int(spec[1:])
        start = max(0, total - suffix)
        end = total - 1
    else:
        start_s, _, end_s = spec.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else total - 1

    end = min(end, total - 1)
    start = max(0, min(start, end))
    return start, end


def _stream_headers(extra_headers: dict | None = None) -> dict[str, str]:
    return {
        "Accept-Ranges": "bytes",
        # Streams authenticate via a short-lived ?mt= media token in the URL
        # (or Authorization header), not cookies — so a wildcard origin is safe:
        # a cross-origin page cannot read another user's token, and credentials
        # are not required. Keep `*` only as long as get_media_user stays
        # cookie-free; switch to an origin allowlist if cookie auth is added.
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": (
            "Content-Range, Accept-Ranges, X-Actual-Quality, "
            "X-Sample-Rate, X-Bit-Depth, Content-Length"
        ),
        **(extra_headers or {}),
    }


def _ranged_part_response(
    path: Path,
    request: Request,
    media_type: str,
    headers: dict[str, str],
    resource_total: int | None,
) -> Response | FileResponse:
    """Serve a growing .part file with optional known full asset size (seek metadata)."""
    size = path.stat().st_size
    total = resource_total if resource_total and resource_total >= size else size
    if size == 0:
        return FileResponse(path, media_type=media_type, headers=headers)
    # A request with no Range header must NOT fall through to a plain
    # FileResponse here: Starlette would set Content-Length to the file's
    # CURRENT (still-growing) size with no signal that more data is coming,
    # so a client either believes that's the whole resource (a fetch()-based
    # cache download would wrongly treat it as complete) or the <audio>
    # element locks in a truncated duration from it. Synthesize a full-file
    # range instead, same as streaming_part_response, so this always goes
    # through the unknown-length-aware Content-Range path below.
    rh = request.headers.get("range") or f"bytes=0-{size - 1}"

    try:
        start, end = parse_byte_range(
            rh, size, resource_total=total if total > size else None,
        )
    except (ValueError, IndexError):
        return FileResponse(path, media_type=media_type, headers=headers)

    if start >= size:
        raise HTTPException(
            status_code=503,
            detail="Stream segment not ready",
            headers={"Retry-After": "1"},
        )

    end = min(end, size - 1)
    if start > end:
        raise HTTPException(
            status_code=503,
            detail="Stream segment not ready",
            headers={"Retry-After": "1"},
        )

    length = end - start + 1
    with path.open("rb") as handle:
        handle.seek(start)
        body = handle.read(length)

    headers = dict(headers)
    # `total` falls back to bytes-downloaded-so-far when the real asset size
    # isn't known yet (HEAD request still in flight) -- announcing THAT as the
    # Content-Range total is wrong, not just imprecise: browsers derive the
    # `<audio>` element's `duration` from it, so an early request can lock in
    # a truncated duration the element never corrects, making a later seek
    # past that point look like the track already ended. Use the unknown-
    # length form (RFC 7233) instead of lying about the total.
    total_str = str(total) if resource_total and resource_total >= size else "*"
    headers["Content-Range"] = f"bytes {start}-{end}/{total_str}"
    headers["Content-Length"] = str(length)
    return Response(content=body, status_code=206, media_type=media_type, headers=headers)


def ranged_file_response(
    path: Path,
    request: Request,
    media_type: str,
    extra_headers: dict | None = None,
    resource_total: int | None = None,
) -> Response | FileResponse | StreamingResponse:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stream file missing")

    headers = _stream_headers(extra_headers)
    if path.name.endswith(".part"):
        return _ranged_part_response(path, request, media_type, headers, resource_total)

    # Merged FLAC/M4A on disk — Starlette sendfile handles Range (fast seek).
    return FileResponse(path, media_type=media_type, headers=headers)


async def streaming_part_response(
    part_path: Path,
    final_path: Path,
    request: Request,
    media_type: str,
    extra_headers: dict | None = None,
    resource_total: int | None = None,
) -> Response | FileResponse | StreamingResponse:
    """Stream a growing .part file on one HTTP connection (no 503 retry storms).

    Merged files use a normal ranged read. Suffix ranges (``bytes=-N``) return 503 until
    ``final_path`` exists — callers should wait for a full merge first.
    """
    if final_path.is_file():
        return ranged_file_response(
            final_path, request, media_type, extra_headers, resource_total,
        )

    if not part_path.is_file():
        raise HTTPException(status_code=404, detail="Stream file missing")

    size = part_path.stat().st_size
    total = resource_total if resource_total and resource_total >= size else size
    headers = _stream_headers(extra_headers)
    rh = request.headers.get("range")
    if not rh:
        rh = f"bytes=0-{max(0, size - 1)}"

    if size == 0:
        raise HTTPException(
            status_code=503,
            detail="Stream segment not ready",
            headers={"Retry-After": "1"},
        )

    spec = rh.split("=", 1)[1].strip().split(",", 1)[0].strip()
    range_total = resource_total if resource_total and resource_total > size else None
    if spec.startswith("-") and range_total is None:
        raise HTTPException(
            status_code=503,
            detail="Stream segment not ready",
            headers={"Retry-After": "1"},
        )
    if not spec.startswith("-"):
        start_s, _, _ = spec.partition("-")
        if start_s:
            try:
                raw_start = int(start_s)
            except ValueError:
                raw_start = 0
            if raw_start >= size and range_total is None:
                raise HTTPException(
                    status_code=503,
                    detail="Stream segment not ready",
                    headers={"Retry-After": "0.2"},
                )

    try:
        start, end = parse_byte_range(rh, size, resource_total=range_total)
    except (ValueError, IndexError):
        return FileResponse(part_path, media_type=media_type, headers=headers)

    if range_total and start >= range_total:
        raise HTTPException(
            status_code=503,
            detail="Stream segment not ready",
            headers={"Retry-After": "1"},
        )

    length = end - start + 1
    # See the matching comment in _ranged_part_response — don't announce a
    # downloaded-so-far byte count as the resource's total size.
    total_str = str(total) if resource_total and resource_total >= size else "*"
    headers["Content-Range"] = f"bytes {start}-{end}/{total_str}"
    headers["Content-Length"] = str(length)

    async def _generate():
        pos = start
        left = length
        read_path = part_path
        while left > 0:
            while True:
                if final_path.is_file():
                    read_path = final_path
                    avail = read_path.stat().st_size
                    break
                avail = part_path.stat().st_size if part_path.is_file() else 0
                if avail > pos:
                    break
                await asyncio.sleep(_PART_POLL_SEC)
            take = min(_PART_READ_CHUNK, left, avail - pos)
            if take <= 0:
                await asyncio.sleep(_PART_POLL_SEC)
                continue
            with read_path.open("rb") as handle:
                handle.seek(pos)
                block = handle.read(take)
            if not block:
                await asyncio.sleep(_PART_POLL_SEC)
                continue
            yield block
            pos += len(block)
            left -= len(block)

    return StreamingResponse(
        _generate(),
        status_code=206,
        media_type=media_type,
        headers=headers,
    )
