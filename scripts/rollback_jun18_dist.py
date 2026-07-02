#!/usr/bin/env python3
"""Promote dist-recovered to frontend/dist and deploy without npm build."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)

RECOVERED = ROOT / "frontend" / "dist-recovered"
LIVE = ROOT / "frontend" / "dist"
BACKUP = ROOT / "frontend" / "dist-pre-rollback"


def main() -> None:
    if not (RECOVERED / "assets" / "index-DqMBVLZD.js").is_file():
        raise SystemExit("Run restore_dist_bundle.py first")

    subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_recovered_sw.py")], check=True)

    if LIVE.exists() and not BACKUP.exists():
        shutil.copytree(LIVE, BACKUP)
        print(f"Backed up current dist -> {BACKUP}")

    if LIVE.exists():
        shutil.rmtree(LIVE)
    shutil.copytree(RECOVERED, LIVE)
    print(f"Promoted {RECOVERED} -> {LIVE}")

    env = os.environ.copy()
    env["DEPLOY_SKIP_BUILD"] = "1"
    subprocess.run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT, check=True, env=env)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "deploy_tidal.py")], cwd=ROOT, check=True, env=env)


if __name__ == "__main__":
    main()
