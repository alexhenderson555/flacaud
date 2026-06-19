#!/usr/bin/env python3
"""Prove whether Tidal API ever returns FLAC on LOSSLESS tier for pool account."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

KEY = "xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM="

REMOTE = r"""
import base64, json, time, httpx
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.auth import refresh_token

SEARCHES = [
    "Daft Punk Random Access Memories",
    "Fleetwood Mac Rumours",
    "Pink Floyd Dark Side",
    "Nirvana Nevermind",
    "Radiohead OK Computer",
    "Miles Davis Kind of Blue",
    "Dave Brubeck Time Out",
    "Beethoven Symphony",
    "Billie Eilish When We All Fall Asleep",
    "Taylor Swift Folklore",
    "Kendrick Lamar DAMN",
    "classical piano",
    "jazz standards",
    "FLAC audiophile",
]

KNOWN = [
    ("2809488", "Take Five", "LOSSLESS"),
    ("20115564", "Get Lucky", "LOSSLESS"),
    ("35410166", "Runaway", "LOSSLESS"),
    ("335533579", "Peru remix", "HI_RES"),
    ("68714461", "Dreams remaster", "HI_RES"),
]

def decode(m):
    raw = base64.b64decode(m.manifest)
    mime = m.manifest_mime_type
    if mime == "application/vnd.tidal.bts":
        d = json.loads(raw)
        return {
            "transport": "bts",
            "codecs": (d.get("codecs") or "").lower(),
            "mime": (d.get("mimeType") or "").lower(),
            "urls": len(d.get("urls") or []),
        }
    if mime == "application/dash+xml":
        import xml.etree.ElementTree as ET
        root = ET.fromstring(raw)
        ns = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}
        rep = root.find(".//mpd:Representation", ns)
        codecs = (rep.get("codecs") if rep is not None else "") or ""
        segs = len(root.findall(".//mpd:S", ns)) or 1
        return {"transport": "dash", "codecs": codecs.lower(), "mime": "dash+xml", "urls": segs}
    return {"transport": mime, "codecs": "", "mime": "", "urls": 0}

def is_flac(info):
    c = info.get("codecs") or ""
    return "flac" in c

http = httpx.Client(timeout=90)
acc = next(a for a in tidal_pool.list_accounts() if a.label == "hifi-tv")
tokens = refresh_token(http, acc.refresh_token)
client = TidalClient(http=http, tokens=tokens)

sub = http.get(
    f"https://api.tidal.com/v1/users/{acc.user_id}/subscription",
    params={"countryCode": acc.country_code or "US"},
    headers={"Authorization": f"Bearer {tokens.access_token}"},
).json()
print("SUBSCRIPTION", json.dumps({
    "label": acc.label,
    "user_id": acc.user_id,
    "status": sub.get("status"),
    "type": (sub.get("subscription") or {}).get("type"),
    "highestSoundQuality": sub.get("highestSoundQuality"),
    "premiumAccess": sub.get("premiumAccess"),
}))

seen = set()
rows = []

def probe_id(tid, title, catalog):
    if tid in seen:
        return
    seen.add(tid)
    time.sleep(0.8)
    loss = None
    maxq = None
    err = None
    try:
        m_loss = client.get_playback_manifest(tid, AudioQuality.LOSSLESS)
        loss = decode(m_loss)
        loss["api_q"] = m_loss.audio_quality
        loss["sr"] = m_loss.sample_rate
        loss["bd"] = m_loss.bit_depth
    except Exception as e:
        err = str(e)[:120]
    try:
        m_max = client.get_playback_manifest(tid, AudioQuality.HI_RES_LOSSLESS)
        maxq = decode(m_max)
        maxq["api_q"] = m_max.audio_quality
        maxq["sr"] = m_max.sample_rate
        maxq["bd"] = m_max.bit_depth
    except Exception:
        maxq = None
    rows.append({
        "id": tid,
        "title": title[:50],
        "catalog": catalog,
        "lossless": loss,
        "max": maxq,
        "err": err,
    })

for tid, title, cat in KNOWN:
    probe_id(tid, title, cat)

for query in SEARCHES:
    try:
        items = client.search(query, limit=8).get("tracks", {}).get("items", [])
    except Exception:
        continue
    time.sleep(1)
    for t in items:
        probe_id(str(t["id"]), t.get("title") or "?", (t.get("audioQuality") or "?").upper())
        if len(seen) >= 120:
            break
    if len(seen) >= 120:
        break

loss_flac = [r for r in rows if r.get("lossless") and is_flac(r["lossless"])]
loss_aac = [r for r in rows if r.get("lossless") and not is_flac(r["lossless"]) and "mp4a" in (r["lossless"].get("codecs") or "")]
max_flac = [r for r in rows if r.get("max") and is_flac(r["max"])]

print("SUMMARY", json.dumps({
    "tracks_probed": len(rows),
    "lossless_tier_flac_count": len(loss_flac),
    "lossless_tier_aac_320_count": len(loss_aac),
    "max_tier_flac_count": len(max_flac),
}, indent=2))

if loss_flac:
    print("LOSSLESS_FLAC_HITS", json.dumps(loss_flac[:10], indent=2))
else:
    print("LOSSLESS_FLAC_HITS none")

print("MAX_FLAC_EXAMPLES")
for r in max_flac[:8]:
    print(json.dumps({
        "id": r["id"],
        "title": r["title"],
        "catalog": r["catalog"],
        "lossless_codecs": (r.get("lossless") or {}).get("codecs"),
        "max_codecs": r["max"]["codecs"],
        "max_sr_bd": [r["max"].get("sr"), r["max"].get("bd")],
    }))

print("LOSSLESS_AAC_EXAMPLES")
for r in loss_aac[:6]:
    print(json.dumps({
        "id": r["id"],
        "title": r["title"],
        "catalog": r["catalog"],
        "lossless": r["lossless"],
        "max_codecs": (r.get("max") or {}).get("codecs"),
    }))

http.close()
"""

blob = base64.b64encode(REMOTE.encode()).decode()
cmd = (
    f"cd {DEPLOY_PATH} && docker compose exec -T "
    f"-e TIDALDLRU_POOL_KEY={KEY} api python -c "
    f"{repr(f'import base64; exec(base64.b64decode({blob!r}).decode())')}"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=600))
