#!/usr/bin/env python3
"""Deep probe for track 38048363 (The Nights) — both pool accounts, STREAM/DOWNLOAD."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

TRACK_ID = sys.argv[1] if len(sys.argv) > 1 else "38048363"

REMOTE = f'''
import httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.auth import refresh_token
from tidal_dl_ru.providers.tidal.download import manifest_inspect

TID = "{TRACK_ID}"

http = httpx.Client(timeout=60)
for acc in tidal_pool.list_accounts():
    try:
        tokens = refresh_token(http, acc.refresh_token)
    except Exception as e:
        print(acc.label, "refresh ERR", e)
        continue
    hdr = {{"Authorization": f"Bearer {{tokens.access_token}}"}}
    cc = acc.country_code or tokens.country_code or "US"
    sub = http.get(
        f"https://api.tidal.com/v1/users/{{acc.user_id}}/subscription",
        params={{"countryCode": cc}},
        headers=hdr,
    ).json()
    print(
        "===", acc.label, acc.user_id,
        "status=", sub.get("status"),
        "type=", (sub.get("subscription") or {{}}).get("type"),
        "hq=", sub.get("highestSoundQuality"),
    )
    client = TidalClient(http=http, tokens=tokens)
    tr = client.get_track(TID)
    print("track", repr(tr.title), "catalog=", tr.audio_quality, "isrc=", tr.isrc)
    for mode in ["STREAM", "DOWNLOAD"]:
        for q in [AudioQuality.HIGH, AudioQuality.LOSSLESS, AudioQuality.HI_RES_LOSSLESS]:
            try:
                data = client._get(
                    f"/tracks/{{TID}}/playbackinfopostpaywall",
                    audioquality=q.value,
                    playbackmode=mode,
                    assetpresentation="FULL",
                )
                m = type("M", (), {{
                    "audio_quality": data.get("audioQuality"),
                    "manifest_mime_type": data.get("manifestMimeType"),
                    "manifest": data.get("manifest"),
                    "sample_rate": data.get("sampleRate"),
                    "bit_depth": data.get("bitDepth"),
                }})()
                info = manifest_inspect(m)
                print(
                    mode, q.name,
                    "api=", data.get("audioQuality"),
                    info.get("kind"), info.get("codecs"),
                    "sr=", data.get("sampleRate"), "bd=", data.get("bitDepth"),
                )
            except Exception as e:
                print(mode, q.name, "ERR", e)
    print()
http.close()
'''

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=180))
