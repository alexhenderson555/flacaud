#!/usr/bin/env python3
"""Find all Tidal track IDs for a search query and probe HI_RES for FLAC."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

QUERY = sys.argv[1] if len(sys.argv) > 1 else "The Nights Avicii"

REMOTE = f'''
import httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.download import manifest_inspect

http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
client = TidalClient(http=http, tokens=tokens)
items = client.search({QUERY!r}, limit=15).get("tracks", {{}}).get("items", [])
print("POOL", acc.label, "results", len(items))
for t in items:
    tid = str(t["id"])
    title = t.get("title")
    album = (t.get("album") or {{}}).get("title")
    aq = t.get("audioQuality")
    try:
        m = client.get_playback_manifest(tid, AudioQuality.HI_RES_LOSSLESS)
        info = manifest_inspect(m)
        print(tid, repr(title), "|", repr(album), "catalog=", aq, "api=", m.audio_quality, info.get("codecs"), "sr=", m.sample_rate, "bd=", m.bit_depth)
    except Exception as e:
        print(tid, repr(title), "ERR", e)
http.close()
'''

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
