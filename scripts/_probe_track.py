#!/usr/bin/env python3
"""Probe a single Tidal track on prod. Usage: python scripts/_probe_track.py 420064486"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

TRACK_ID = sys.argv[1] if len(sys.argv) > 1 else "420064486"

REMOTE = f'''
import httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.download import manifest_inspect, manifest_lossless_meta
from tidal_dl_ru.server.routers.media import (
    _stream_quality_candidates,
    _manifest_acceptable_for_request,
    _delivered_stream_meta,
    _resolve_tidal_stream,
)
from tidal_dl_ru.providers.tidal import pool as tidal_pool_mod
from tidal_dl_ru.core.router import get_provider_by_name

TID = "{TRACK_ID}"

http = httpx.Client(timeout=60)
acc, tokens = tidal_pool.acquire(http)
print("POOL", acc.id, acc.label, acc.user_id, tokens.country_code)
client = TidalClient(http=http, tokens=tokens, on_auth_error=lambda s,i=acc.id: tidal_pool.report_failure(i,s))
try:
    tr = client.get_track(TID)
    print("TRACK", repr(tr.title), "catalog=", tr.audio_quality)
except Exception as e:
    print("TRACK err", e)

for enum_q in [AudioQuality.HIGH, AudioQuality.LOSSLESS, getattr(AudioQuality, "HI_RES_LOSSLESS", None)]:
    if enum_q is None:
        continue
    try:
        m = client.get_playback_manifest(TID, enum_q)
        info = manifest_inspect(m)
        sr, bd = manifest_lossless_meta(m)
        ok = _manifest_acceptable_for_request(m, AudioQuality.LOSSLESS, "lifetime")
        print(enum_q.name, "api="+str(m.audio_quality), info.get("kind"), info.get("codecs"), "sr="+str(sr), "bd="+str(bd), "flac_ok="+str(ok))
    except Exception as e:
        print(enum_q.name, "ERR", e)

print("candidates", [q.name for q in _stream_quality_candidates(AudioQuality.LOSSLESS)])
print("meta LOSSLESS", _delivered_stream_meta(client, TID, "LOSSLESS", "lifetime"))
print("meta HI_RES", _delivered_stream_meta(client, TID, "HI_RES", "lifetime"))

p = get_provider_by_name("tidal")
try:
    res = _resolve_tidal_stream(p, TID, AudioQuality.LOSSLESS, "lifetime")
    print("resolve", res.get("type"), "actual="+str(res.get("actual_quality")))
except Exception as e:
    print("resolve ERR", e)

http.close()
'''

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=180))
