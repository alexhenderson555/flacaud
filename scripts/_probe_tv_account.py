#!/usr/bin/env python3
"""Probe playback tiers for a specific pool account label."""
from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

KEY = "xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM="


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="hifi-tv")
    args = parser.parse_args()

    remote = f'''
import base64, json, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.auth import refresh_token

LABEL = {args.label!r}

def peek(m):
    raw = base64.b64decode(m.manifest)
    if m.manifest_mime_type == "application/vnd.tidal.bts":
        d = json.loads(raw)
        return "bts", d.get("codecs", ""), d.get("mimeType", "")
    import xml.etree.ElementTree as ET
    root = ET.fromstring(raw)
    ns = {{"mpd": "urn:mpeg:dash:schema:mpd:2011"}}
    rep = root.find(".//mpd:Representation", ns)
    return "dash", (rep.get("codecs") if rep is not None else ""), "dash+xml"

http = httpx.Client(timeout=60)
accs = tidal_pool.list_accounts()
acc = next((a for a in accs if a.label == LABEL), None)
if acc is None:
    print("NO_ACCOUNT", LABEL)
    raise SystemExit(1)
tokens = refresh_token(http, acc.refresh_token)
uid = acc.user_id or tokens.user_id
hdr = {{"Authorization": f"Bearer {{tokens.access_token}}"}}
cc = tokens.country_code or acc.country_code or "US"
r = http.get("https://api.tidal.com/v1/sessions", params={{"countryCode": cc}}, headers=hdr)
print("SESSION", r.status_code, r.text[:500])
client = TidalClient(
    http=http,
    tokens=tokens,
    on_auth_error=lambda s, i=acc.id: tidal_pool.report_failure(i, s),
)
for tid, name in [
    ("2809488", "Take Five"),
    ("20115564", "Get Lucky"),
    ("335533579", "Peru"),
    ("35410166", "Runaway"),
]:
    for enum_q, label in [
        (AudioQuality.LOSSLESS, "FLAC"),
        (AudioQuality.HI_RES_LOSSLESS, "MAX"),
    ]:
        m = client.get_playback_manifest(tid, enum_q)
        kind, codecs, mime = peek(m)
        print(name, label, "api=" + m.audio_quality, kind, codecs, mime, "sr=" + str(m.sample_rate), "bd=" + str(m.bit_depth))
http.close()
'''
    blob = base64.b64encode(remote.encode()).decode()
    cmd = (
        f"cd {DEPLOY_PATH} && docker compose exec -T "
        f"-e TIDALDLRU_POOL_KEY={KEY} api python -c "
        f"{repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
    )
    return _ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120)


if __name__ == "__main__":
    raise SystemExit(main())
