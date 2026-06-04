"""Byte-range file responses for seekable streaming."""

import tempfile
from pathlib import Path

import pytest
from fastapi import Request

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
        assert resp.status_code == 206
        assert resp.headers["content-range"] == "bytes 10-19/200"
        assert len(resp.body) == 10
