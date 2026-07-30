"""Byte-range file responses for seekable streaming."""

import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException, Request

from tidal_dl_ru.server.range_file import parse_byte_range, ranged_file_response


def test_parse_byte_range():
    start, end = parse_byte_range("bytes=0-99", 1000)
    assert start == 0
    assert end == 99

    start, end = parse_byte_range("bytes=500-", 1000)
    assert start == 500
    assert end == 999

    start, end = parse_byte_range("bytes=-100", 1000)
    assert start == 900
    assert end == 999


def test_parse_byte_range_seek_not_clamped_to_partial_buffer():
    start, end = parse_byte_range("bytes=500-", 200, resource_total=1000)
    assert start == 500
    assert end == 999


def test_ranged_file_response_206():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "audio.m4a"
        path.write_bytes(b"\x00" * 200)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=10-19")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = ranged_file_response(path, request, "audio/mp4")
        from fastapi.responses import FileResponse

        assert isinstance(resp, FileResponse)


def test_ranged_part_file_reports_full_total_for_seek():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "audio.flac.part"
        path.write_bytes(b"\x00" * 200)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=10-19")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = ranged_file_response(path, request, "audio/flac", resource_total=1000)
        assert resp.status_code == 206
        assert resp.headers["content-range"] == "bytes 10-19/1000"


def test_ranged_part_file_reports_unknown_total_when_size_not_yet_known():
    """When resource_total hasn't resolved yet, must not announce the
    downloaded-so-far byte count as the resource's total size -- browsers
    derive <audio>.duration from Content-Range and would lock in a truncated
    duration that a later seek past it would look like the track ended."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "audio.flac.part"
        path.write_bytes(b"\x00" * 200)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=10-19")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = ranged_file_response(path, request, "audio/flac", resource_total=None)
        assert resp.status_code == 206
        assert resp.headers["content-range"] == "bytes 10-19/*"


def test_ranged_part_waits_when_seek_beyond_buffer():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "audio.flac.part"
        path.write_bytes(b"\x00" * 200)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=500-599")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        with pytest.raises(HTTPException) as exc:
            ranged_file_response(path, request, "audio/flac", resource_total=1000)
        assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_streaming_part_suffix_waits_for_tail_with_total():
    import asyncio

    from tidal_dl_ru.server.range_file import streaming_part_response

    with tempfile.TemporaryDirectory() as tmp:
        part = Path(tmp) / "audio.m4a.part"
        final = Path(tmp) / "audio.m4a"
        part.write_bytes(b"\x00" * 50)

        async def grow():
            await asyncio.sleep(0.05)
            part.write_bytes(b"\x00" * 1000)

        asyncio.create_task(grow())

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=-100")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = await streaming_part_response(
            part, final, request, "audio/mp4", resource_total=1000,
        )
        assert resp.status_code == 206
        body = b""
        async for chunk in resp.body_iterator:
            body += chunk
        assert len(body) == 100


@pytest.mark.asyncio
async def test_streaming_part_reports_unknown_total_when_size_not_yet_known():
    from tidal_dl_ru.server.range_file import streaming_part_response

    with tempfile.TemporaryDirectory() as tmp:
        part = Path(tmp) / "audio.flac.part"
        final = Path(tmp) / "audio.flac"
        part.write_bytes(b"\x00" * 200)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=10-19")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = await streaming_part_response(
            part, final, request, "audio/flac", resource_total=None,
        )
        assert resp.status_code == 206
        assert resp.headers["content-range"] == "bytes 10-19/*"


@pytest.mark.asyncio
async def test_streaming_part_yields_when_buffer_grows():
    import asyncio

    from tidal_dl_ru.server.range_file import streaming_part_response

    with tempfile.TemporaryDirectory() as tmp:
        part = Path(tmp) / "audio.flac.part"
        final = Path(tmp) / "audio.flac"
        part.write_bytes(b"\x00" * 20)

        async def grow():
            await asyncio.sleep(0.05)
            part.write_bytes(b"\x00" * 120)

        asyncio.create_task(grow())

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=50-99")],
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(scope, receive)
        resp = await streaming_part_response(
            part, final, request, "audio/flac", resource_total=1000,
        )
        assert resp.status_code == 206
        body = b""
        async for chunk in resp.body_iterator:
            body += chunk
        assert len(body) == 50
