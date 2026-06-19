#!/usr/bin/env python3
"""Compare PKCE vs TV refresh paths for pool accounts."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

KEY = "xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM="

REMOTE = r"""
import base64, json, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import pkce_refresh_token, refresh_token
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.config import TV_CLIENT_ID, TV_CLIENT_SECRET, AUTH_BASE

def tv_only(http, refresh):
    resp = http.post(
        f"{AUTH_BASE}/token",
        data={
            "client_id": TV_CLIENT_ID,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
            "scope": "r_usr+w_usr+w_sub",
        },
        auth=(TV_CLIENT_ID, TV_CLIENT_SECRET),
    )
    if resp.status_code != 200:
        raise RuntimeError(resp.status_code, resp.text[:200])
    data = resp.json()
    from tidal_dl_ru.providers.tidal.models import TokenSet
    import time
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token", refresh),
        token_type=data.get("token_type", "Bearer"),
        expires_at=time.time() + int(data["expires_in"]) - 30,
        user_id=data.get("user", {}).get("userId"),
        country_code=data.get("user", {}).get("countryCode"),
    )

http = httpx.Client(timeout=60)
for label in ["hifi-new", "hifi-tv"]:
    acc = next(a for a in tidal_pool.list_accounts() if a.label == label)
    rt = acc.refresh_token
    print("===", label, "===")
    for name, fn in [
        ("pkce_only", lambda: pkce_refresh_token(http, rt)),
        ("tv_only", lambda: tv_only(http, rt)),
        ("unified", lambda: refresh_token(http, rt)),
    ]:
        try:
            t = fn()
            hdr = {"Authorization": f"Bearer {t.access_token}"}
            sess = http.get(
                "https://api.tidal.com/v1/sessions",
                params={"countryCode": "US"},
                headers=hdr,
            ).json()
            client_name = sess.get("client", {}).get("name", "?")
            c = TidalClient(http=http, tokens=t)
            m = c.get_playback_manifest("2809488", AudioQuality.LOSSLESS)
            raw = base64.b64decode(m.manifest)
            codecs = (
                json.loads(raw).get("codecs")
                if m.manifest_mime_type.endswith("bts")
                else "dash"
            )
            print(name, "client=", client_name[:70], "api=", m.audio_quality, "codecs=", codecs)
        except Exception as e:
            print(name, "ERR", e)
http.close()
"""

blob = base64.b64encode(REMOTE.encode()).decode()
cmd = (
    f"cd {DEPLOY_PATH} && docker compose exec -T "
    f"-e TIDALDLRU_POOL_KEY={KEY} api python -c "
    f"{repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
