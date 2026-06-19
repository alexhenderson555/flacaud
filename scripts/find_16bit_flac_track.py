#!/usr/bin/env python3
"""Find Tidal tracks with real 16-bit FLAC on LOSSLESS tier."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REMOTE = r"""
import base64, json, time, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality

CANDIDATES = [
    ("Get Lucky", "Daft Punk Get Lucky"),
    ("Dreams", "Fleetwood Mac Dreams"),
    ("Smells Like Teen Spirit", "Nirvana Smells Like Teen Spirit"),
    ("Bohemian Rhapsody", "Queen Bohemian Rhapsody"),
    ("Hotel California", "Eagles Hotel California"),
    ("Stairway to Heaven", "Led Zeppelin Stairway"),
    ("Billie Jean", "Michael Jackson Billie Jean"),
    ("Take Five", "Dave Brubeck Take Five"),
]

def peek(m):
    mime = m.manifest_mime_type
    raw = base64.b64decode(m.manifest)
    if mime == "application/vnd.tidal.bts":
        d = json.loads(raw)
        return {"kind": "bts", "codecs": d.get("codecs") or "", "urls": len(d.get("urls") or [])}
    if mime == "application/dash+xml":
        import xml.etree.ElementTree as ET
        root = ET.fromstring(raw)
        ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
        rep = root.find(".//mpd:Representation", ns)
        return {"kind": "dash", "codecs": (rep.get("codecs") if rep is not None else "") or ""}
    return {"kind": "other", "codecs": ""}

def classify(m, info):
    codecs = (info.get("codecs") or "").lower()
    sr = m.sample_rate or 0
    bd = m.bit_depth or 0
    if "flac" in codecs:
        if sr > 48000 or bd > 16:
            return "flac_hires"
        return "flac_16"
    if "mp4a" in codecs or "aac" in codecs:
        return "aac_320"
    return "other"

http = httpx.Client(timeout=60.0, follow_redirects=True)
try:
    acc, tokens = tidal_pool.acquire(http)
    client = TidalClient(http=http, tokens=tokens, on_auth_error=lambda s,i=acc.id: tidal_pool.report_failure(i,s))
except tidal_pool.NoAccountAvailable:
    client = TidalClient(http=http)

print("ACCOUNT", json.dumps({
    "country": client.tokens.country_code,
    "user_id": client.tokens.user_id,
}, indent=2))

hits = []
for label, query in CANDIDATES:
    items = client.search(query, limit=3).get("tracks", {}).get("items", [])
    time.sleep(1)
    for t in items:
        aq = (t.get("audioQuality") or "").upper()
        if "HI_RES" in aq:
            continue
        tid = str(t["id"])
        time.sleep(2)
        try:
            m = client.get_playback_manifest(tid, AudioQuality.LOSSLESS)
            info = peek(m)
            kind = classify(m, info)
            row = {
                "id": tid,
                "title": t.get("title"),
                "catalog": t.get("audioQuality"),
                "api": m.audio_quality,
                "class": kind,
                **info,
                "sr": m.sample_rate,
                "bd": m.bit_depth,
            }
            print(label, json.dumps(row, ensure_ascii=False))
            if kind == "flac_16":
                hits.append(row)
        except Exception as e:
            print(label, "ERR", tid, e)
        time.sleep(1)

print("HITS", json.dumps(hits, ensure_ascii=False, indent=2))
http.close()
"""


def main() -> int:

    sys.path.insert(0, str(ROOT))
    from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

    pw = _password("TIDAL_SSH_PASSWORD")
    blob = base64.b64encode(REMOTE.encode()).decode()
    inner = f"import base64; exec(base64.b64decode('{blob}').decode())"
    cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
    return _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=300)


if __name__ == "__main__":
    raise SystemExit(main())
