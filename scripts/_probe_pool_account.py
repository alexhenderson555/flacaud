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

def peek(m):
    raw = base64.b64decode(m.manifest)
    if m.manifest_mime_type == "application/vnd.tidal.bts":
        d = json.loads(raw)
        return "bts", d.get("codecs", "")
    import xml.etree.ElementTree as ET
    root = ET.fromstring(raw)
    ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
    rep = root.find(".//mpd:Representation", ns)
    return "dash", (rep.get("codecs") if rep is not None else "")

http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
print("POOL", acc.id, acc.label, acc.user_id, tokens.country_code)
client = TidalClient(http=http, tokens=tokens, on_auth_error=lambda s,i=acc.id: tidal_pool.report_failure(i,s))
for tid, name in [("2809488","Take Five"),("20115564","Get Lucky"),("335533579","Peru"),("35410166","Runaway")]:
    for enum_q, label in [(AudioQuality.LOSSLESS,"FLAC"),(AudioQuality.HI_RES_LOSSLESS,"MAX")]:
        m = client.get_playback_manifest(tid, enum_q)
        kind, codecs = peek(m)
        print(name, label, "api="+m.audio_quality, kind, codecs, "sr="+str(m.sample_rate), "bd="+str(m.bit_depth))
http.close()
"""
blob = base64.b64encode(REMOTE.encode()).decode()
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T -e TIDALDLRU_POOL_KEY=xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM= api python -c {repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
