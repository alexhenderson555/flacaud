#!/usr/bin/env python3
"""Live Tidal manifest probe — shows BTS vs DASH segments per quality tier.

Usage (on server with Tidal pool):
  python scripts/probe_manifest_tiers.py TRACK_ID
  python scripts/probe_manifest_tiers.py --search "Runaway Galantis"

Remote:
  TIDAL_SSH_PASSWORD=... python scripts/probe_manifest_tiers.py --remote --search "Runaway"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tidal_dl_ru.providers.tidal.download import manifest_inspect  # noqa: E402
from tidal_dl_ru.providers.tidal.models import AudioQuality  # noqa: E402
from tidal_dl_ru.providers.tidal.quality_probe import (  # noqa: E402
    manifest_delivers_ui_tier,
    probe_tidal_qualities,
)


def _client():
    import httpx

    from tidal_dl_ru.providers.tidal import pool as tidal_pool
    from tidal_dl_ru.providers.tidal.client import TidalClient

    http = httpx.Client(timeout=60.0, follow_redirects=True)
    try:
        acc, tokens = tidal_pool.acquire(http)
        return TidalClient(
            http=http,
            tokens=tokens,
            on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),
        ), http
    except tidal_pool.NoAccountAvailable:
        return TidalClient(http=http), http


def _search_track(client, query: str) -> str:
    data = client.search(query, limit=1, offset=0)
    items = (data.get("tracks") or {}).get("items") or []
    if not items:
        raise SystemExit(f"No tracks for: {query!r}")
    t = items[0]
    print(f"Track: {t.get('title')} — {t.get('id')} (catalog {t.get('audioQuality')})")
    return str(t["id"])


def probe_track(client, track_id: str) -> None:
    meta = client.get_track(track_id)
    print(f"\n=== {meta.title} ({track_id}) catalog={meta.audio_quality} ===\n")

    rows = []
    for enum_q, ui_q in (
        (AudioQuality.HI_RES_LOSSLESS, "HI_RES"),
        (AudioQuality.LOSSLESS, "LOSSLESS"),
        (AudioQuality.HIGH, "HIGH"),
    ):
        row = {"ui": ui_q, "error": None}
        try:
            m = client.get_playback_manifest(track_id, enum_q)
            info = manifest_inspect(m)
            row.update(
                {
                    "api_quality": m.audio_quality,
                    "mime": m.manifest_mime_type,
                    "sample_rate": m.sample_rate,
                    "bit_depth": m.bit_depth,
                    "delivers": manifest_delivers_ui_tier(m, ui_q),
                    **info,
                }
            )
        except Exception as exc:
            row["error"] = str(exc)
        rows.append(row)

    for row in rows:
        ui = row["ui"]
        if row.get("error"):
            print(f"{ui:8} ERROR {row['error']}")
            continue
        print(
            f"{ui:8} api={row.get('api_quality')} mime={row.get('mime')} "
            f"kind={row.get('kind')} codecs={row.get('codecs')!r} "
            f"segs={row.get('segments')} ext={row.get('extension')} "
            f"sr={row.get('sample_rate')} bd={row.get('bit_depth')} "
            f"delivers={row.get('delivers')}"
        )

    summary = probe_tidal_qualities(client, track_id)
    print("\nprobe_tidal_qualities:")
    print(json.dumps(summary, indent=2))


def run_remote(argv: list[str]) -> int:
    sys.path.insert(0, str(ROOT))
    from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

    pw = _password("TIDAL_SSH_PASSWORD")
    args = " ".join(argv)
    cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python scripts/probe_manifest_tiers.py {args}"
    return _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("track_id", nargs="?", help="Tidal track id")
    parser.add_argument("--search", "-s", help="Search query → first track")
    parser.add_argument("--remote", action="store_true", help="Run via SSH on production")
    args, rest = parser.parse_known_args()

    if args.remote:
        argv = rest + ([args.track_id] if args.track_id else [])
        if args.search:
            argv = ["--search", args.search] + argv
        return run_remote(argv)

    client, http = _client()
    try:
        track_id = args.track_id
        if args.search:
            track_id = _search_track(client, args.search)
        if not track_id:
            parser.error("track_id or --search required")
        probe_track(client, track_id)
    finally:
        http.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
