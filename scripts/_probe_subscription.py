#!/usr/bin/env python3
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

REMOTE = r"""
import base64, json, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality

http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
uid = acc.user_id or tokens.user_id
hdr = {"Authorization": f"Bearer {tokens.access_token}"}
cc = tokens.country_code or "US"
for path in [f"/users/{uid}", f"/users/{uid}/subscription", "/sessions"]:
    try:
        r = http.get("https://api.tidal.com/v1" + path, params={"countryCode": cc}, headers=hdr)
        print(path, r.status_code, r.text[:1200])
    except Exception as e:
        print(path, "ERR", e)

client = TidalClient(http=http, tokens=tokens, on_auth_error=lambda s,i=acc.id: tidal_pool.report_failure(i,s))
tid = "2809488"
for mode in ["STREAM", "DOWNLOAD"]:
    for q in [AudioQuality.LOSSLESS, AudioQuality.HIGH]:
        try:
            data = client._get(f"/tracks/{tid}/playbackinfopostpaywall", audioquality=q.value, playbackmode=mode, assetpresentation="FULL")
            raw = base64.b64decode(data["manifest"])
            if data.get("manifestMimeType","").endswith("bts"):
                d = json.loads(raw)
                codecs = d.get("codecs")
            else:
                codecs = "dash"
            print(mode, q.value, "api="+data.get("audioQuality"), data.get("manifestMimeType"), "codecs="+str(codecs), "sr="+str(data.get("sampleRate")), "bd="+str(data.get("bitDepth")))
        except Exception as e:
            print(mode, q.value, "ERR", e)
http.close()
"""
blob = base64.b64encode(REMOTE.encode()).decode()
KEY = "xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM="
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T -e TIDALDLRU_POOL_KEY={KEY} api python -c {repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
