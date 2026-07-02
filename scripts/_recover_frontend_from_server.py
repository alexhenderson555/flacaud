#!/usr/bin/env python3
"""Recover frontend dist + optional docker src from production."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    if (ROOT / ".env.local").is_file():

        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

from repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

# Bundles on server before 2026-06-18 18:00 (UTC+3 server time assumed = file mtime)
CANDIDATES_BEFORE_18 = [
    ("index-DmuBeNZX.js", "2026-06-18 01:58", 235902),
    ("index-DqMBVLZD.js", "2026-06-18 01:13", 234945),
    ("index-wKFqaT4y.js", "2026-06-18 00:37", 234283),
    ("index-UKDqZaNC.js", "2026-06-18 00:29", 234095),
    ("index-DRrTUjyX.js", "2026-06-17 16:38", 232646),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--bundle",
        default="index-wKFqaT4y.js",
        help="Target index bundle filename on server (default: player-fix build)",
    )
    parser.add_argument("--inspect-docker", action="store_true")
    args = parser.parse_args()

    pw = _password("TIDAL_SSH_PASSWORD")
    bundle = args.bundle

    print("Candidates before Jun 18 18:00:")
    for name, ts, size in CANDIDATES_BEFORE_18:
        print(f"  {name}  {ts}  {size} bytes")

    cmds = [
        f"test -f /opt/tidal-dl-ru/frontend/dist/assets/{bundle} && wc -c /opt/tidal-dl-ru/frontend/dist/assets/{bundle}",
        f"grep -l '{bundle}' /opt/tidal-dl-ru/frontend/dist/index.html 2>/dev/null || echo 'not in current index.html'",
        "ls -la /opt/tidal-dl-ru/frontend/dist/index.html /opt/tidal-dl-ru/frontend/dist/sw.js 2>/dev/null",
    ]

    if args.inspect_docker:
        cmds.append(
            "IMG=$(docker inspect tidal-dl-ru-api-1 --format '{{.Config.Image}}' 2>/dev/null); "
            "echo IMAGE=$IMG; "
            "docker run --rm --entrypoint sh $IMG -c "
            "'wc -c /app/frontend/src/hooks/usePlayerQueue.js /app/frontend/src/components/player/PlayerLogic.jsx "
            "/app/frontend/src/components/player/GlobalAudio.jsx 2>/dev/null || echo no-src'"
        )

    for c in cmds:
        print(f"\n=== {c[:100]} ===")
        _ssh_run(TIDAL_HOST, TIDAL_USER, pw, c, timeout=120)

    print(f"\nTo restore dist only: download assets/{bundle} + matching index.html from server.")
    print("Source code is NOT in git for new arch — recover from docker image if wc > 0.")


if __name__ == "__main__":
    main()
