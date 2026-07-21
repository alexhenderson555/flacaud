"""Extract a tracklist from a YouTube/SoundCloud video description.

Many DJ sets list "00:00 Artist - Title" (or "[00:00]", "1. 00:00 ...", "0:00:00 ...")
directly in the description — when that's present we get an instant tracklist
without running the slow Shazam-based audio analysis in set_analyzer.py.
"""

import re

# Leading track number ("1.", "01)", "#3") before the timestamp, if any.
_LEADING_NUM_RE = re.compile(r"^\s*[#]?\d{1,3}[.)]\s*")

# A timestamp anywhere near the start of the line: 0:00, 00:00, 0:00:00, or
# bracketed [00:00] / (00:00).
_TIMESTAMP_RE = re.compile(r"[\[(]?\s*(\d{1,2}(?::\d{2}){1,2})\s*[\])]?")

# Artist / title separator: hyphen, en-dash, em-dash, or " by ".
_SEP_RE = re.compile(r"\s+[-–—]\s+|\s+\bby\b\s+", re.IGNORECASE)

_MIN_LINE_LEN = 4
_MAX_TRACKS = 200


def _parse_line(line: str) -> dict | None:
    line = line.strip()
    if len(line) < _MIN_LINE_LEN:
        return None
    line = _LEADING_NUM_RE.sub("", line)
    m = _TIMESTAMP_RE.search(line)
    if not m:
        return None
    timestamp = m.group(1)
    rest = (line[: m.start()] + " " + line[m.end():]).strip(" -–—:|.\t")
    if not rest:
        return None
    parts = _SEP_RE.split(rest, maxsplit=1)
    if len(parts) == 2:
        artist, title = parts[0].strip(" -–—"), parts[1].strip(" -–—")
    else:
        artist, title = "Unknown", rest.strip(" -–—")
    if not title:
        return None
    return {"timestamp": timestamp, "artist": artist or "Unknown", "title": title}


def parse_tracklist_from_description(description: str) -> list[dict]:
    """Return [{timestamp, artist, title}, ...] in description order, deduped."""
    if not description:
        return []
    rows: list[dict] = []
    seen_ts: set[str] = set()
    for raw_line in description.splitlines():
        row = _parse_line(raw_line)
        if not row or row["timestamp"] in seen_ts:
            continue
        seen_ts.add(row["timestamp"])
        rows.append(row)
        if len(rows) >= _MAX_TRACKS:
            break
    # A real tracklist has several entries with strictly increasing timestamps;
    # a couple of stray timestamp-looking lines (e.g. a "released 00:01 UTC" line)
    # isn't one — require at least 3 to call it a tracklist.
    if len(rows) < 3:
        return []
    return rows
