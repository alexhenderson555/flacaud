#!/usr/bin/env python3
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

REMOTE = r"""
import base64, json, time, httpx
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality

IDS = [
    ("Runaway", "35410166"),
    ("Get Lucky", "20115564"),
    ("Take Five", "2809488"),
    ("Peru remix", "335533579"),
    ("Dreams", "68714461"),
]

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
c = TidalClient(http=http)
for name, tid in IDS:
    time.sleep(2)
    for enum_q, label in [(AudioQuality.LOSSLESS, "FLAC"), (AudioQuality.HI_RES_LOSSLESS, "MAX")]:
        try:
            m = c.get_playback_manifest(tid, enum_q)
            kind, codecs = peek(m)
            print(name, label, "api="+m.audio_quality, kind, codecs, "sr="+str(m.sample_rate), "bd="+str(m.bit_depth))
        except Exception as e:
            print(name, label, "ERR", e)
        time.sleep(1)
http.close()
"""

def main():
    pw = _password("TIDAL_SSH_PASSWORD")
    blob = base64.b64encode(REMOTE.encode()).decode()
    cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
    return _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=180)

if __name__ == "__main__":
    raise SystemExit(main())
