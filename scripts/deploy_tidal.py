#!/usr/bin/env python3
"""Deploy tidal-dl-ru ONLY to 46.17.102.157 (proshli.ru). Never touches VPN on 151.

Usage:
  set TIDAL_SSH_PASSWORD=...
  python scripts/deploy_tidal.py

Uses DEPLOY_HOST from env/.env if set, else 46.17.102.157.
"""
from __future__ import annotations

import os
import sys

# Never run VPN maintenance from this entrypoint
os.environ.setdefault("TIDAL_HOST", os.environ.get("DEPLOY_HOST", "46.17.102.157"))
os.environ.pop("VPN_FIX", None)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from scripts.repair_servers import deploy_tidal_server, smoke_tidal  # noqa: E402


def main() -> None:
    print(f"Deploy tidal only -> {os.environ.get('TIDAL_HOST', '46.17.102.157')} (VPN host NOT contacted)")
    deploy_tidal_server()
    smoke_tidal()
    print("Tidal deploy complete.")


if __name__ == "__main__":
    main()
