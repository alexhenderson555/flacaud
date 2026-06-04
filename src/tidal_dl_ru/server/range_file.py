"""Byte-range responses for seekable cached audio (Spotify-style scrubbing)."""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response


def parse_byte_range(range_header: str, file_size: int) -> tuple[int, int]:
    if not range_header.lower().startswith("bytes="):
        raise ValueError("bad range")
    spec = range_header.split("=", 1)[1].strip()
    if "," in spec:
        spec = spec.split(",", 1)[0].strip()
    if spec.startswith("-"):
        suffix = int(spec[1:])
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        start_s, _, end_s = spec.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
    if file_size <= 0:
        return 0, 0
    end = min(end, file_size - 1)
    start = max(0, min(start, end))
    return start, end


def ranged_file_response(
    path: Path,
    request: Request,
    media_type: str,
    extra_headers: dict | None = None,
) -> Response | FileResponse:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stream file missing")

    size = path.stat().st_size
    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, X-Actual-Quality, Content-Length",
        **(extra_headers or {}),
    }
    rh = request.headers.get("range")
    if not rh or size == 0:
        return FileResponse(path, media_type=media_type, headers=headers)

    try:
        start, end = parse_byte_range(rh, size)
    except (ValueError, IndexError):
        return FileResponse(path, media_type=media_type, headers=headers)

    length = end - start + 1
    with path.open("rb") as handle:
        handle.seek(start)
        body = handle.read(length)

    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(length)
    return Response(content=body, status_code=206, media_type=media_type, headers=headers)
