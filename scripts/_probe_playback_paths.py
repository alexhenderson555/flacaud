#!/usr/bin/env python3
"""Try alternate Tidal playback endpoints for a track."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

TRACK_ID = sys.argv[1] if len(sys.argv) > 1 else "38048363"

REMOTE = f'''
import base64, json, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality

TID = "{TRACK_ID}"
http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
client = TidalClient(http=http, tokens=tokens)

paths = [
    f"/tracks/{{TID}}/playbackinfo",
    f"/tracks/{{TID}}/playbackinfopostpaywall",
    f"/tracks/{{TID}}/urlpostpaywall",
]
for path in paths:
    for q in ["HIGH", "LOSSLESS", "HI_RES_LOSSLESS"]:
        for mode in ["STREAM"]:
            try:
                data = client._get(path, audioquality=q, playbackmode=mode, assetpresentation="FULL")
                raw = base64.b64decode(data.get("manifest", ""))
                mime = data.get("manifestMimeType", "")
                if mime.endswith("bts"):
                    codecs = json.loads(raw).get("codecs")
                else:
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(raw)
                    ns = {{"mpd": "urn:mpeg:dash:schema:mpd:2011"}}
                    rep = root.find(".//mpd:Representation", ns)
                    codecs = rep.get("codecs") if rep is not None else "?"
                print(path.split("/")[-1], q, "api=", data.get("audioQuality"), mime.split("/")[-1][:8], "codecs=", codecs, "sr=", data.get("sampleRate"))
            except Exception as e:
                print(path.split("/")[-1], q, "ERR", str(e)[:80])
http.close()
'''

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
