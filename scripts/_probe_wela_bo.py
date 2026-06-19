#!/usr/bin/env python3
"""Deep probe for Wela Bo — STREAM vs DOWNLOAD, track meta."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

TID = sys.argv[1] if len(sys.argv) > 1 else "423490258"

REMOTE = f'''
import base64, json, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.download import manifest_inspect

TID = "{TID}"
http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
client = TidalClient(http=http, tokens=tokens)
tr = client.get_track(TID)
print("TRACK", repr(tr.title), "catalog=", tr.audio_quality, "isrc=", tr.isrc, "dur=", tr.duration)
print("album", tr.album.title if tr.album else None)

for mode in ["STREAM", "DOWNLOAD"]:
    for q in [AudioQuality.HIGH, AudioQuality.LOSSLESS, getattr(AudioQuality, "HI_RES_LOSSLESS", None)]:
        if q is None:
            continue
        try:
            data = client._get(
                f"/tracks/{{TID}}/playbackinfopostpaywall",
                audioquality=q.value,
                playbackmode=mode,
                assetpresentation="FULL",
            )
            m = type("M", (), data)()
            from tidal_dl_ru.providers.tidal.models import PlaybackManifest
            pm = PlaybackManifest.model_validate(data)
            info = manifest_inspect(pm)
            print(mode, q.name, "api=", data.get("audioQuality"), info.get("kind"), info.get("codecs"),
                  "sr=", data.get("sampleRate"), "bd=", data.get("bitDepth"))
        except Exception as e:
            print(mode, q.name, "ERR", e)

hdr = {{"Authorization": f"Bearer {{tokens.access_token}}"}}
print("--- countryCode sweep ---")
for cc in ["US", "GB", "DE"]:
    for q in ["LOSSLESS", "HI_RES_LOSSLESS"]:
        try:
            r = http.get(
                f"https://api.tidal.com/v1/tracks/{{TID}}/playbackinfopostpaywall",
                params={{"audioquality": q, "playbackmode": "STREAM", "assetpresentation": "FULL", "countryCode": cc}},
                headers=hdr,
            )
            data = r.json()
            pm = PlaybackManifest.model_validate(data)
            info = manifest_inspect(pm)
            print(cc, q, "api=", data.get("audioQuality"), info.get("codecs"), "sr=", data.get("sampleRate"))
        except Exception as e:
            print(cc, q, "ERR", str(e)[:70])

http.close()
'''

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
