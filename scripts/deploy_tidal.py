#!/usr/bin/env python3
"""Deploy FlacAud to production (flacaud.ru). Never touches VPN on 151.

Usage:
  set TIDAL_SSH_PASSWORD=...
  set TIDAL_HOST or DEPLOY_HOST in .env
  python scripts/deploy_tidal.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    # Real secrets live in .env.local (gitignored); .env holds placeholders.
    # Load .env first, then .env.local overrides with real values.
    load_dotenv(ROOT / ".env", override=True)
    if (ROOT / ".env.local").is_file():
        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

sys.path.insert(0, str(ROOT / "scripts"))
from _ops_env import tidal_host  # noqa: E402

os.environ.setdefault("TIDAL_HOST", os.environ.get("DEPLOY_HOST") or tidal_host(required=False) or "")
os.environ.pop("VPN_FIX", None)

from scripts.repair_servers import (  # noqa: E402
    check_manifest_failures,
    check_pool_status,
    deploy_tidal_server,
    smoke_tidal,
    verify_password_reset_mail_ready,
)


def main() -> None:
    host = os.environ.get("TIDAL_HOST") or tidal_host()
    if "--logs-only" in sys.argv:
        print(f"Manifest-fetch-failed log lines -> {host}")
        check_manifest_failures()
        return
    if "--pool-status" in sys.argv:
        print(f"Tidal pool status -> {host}")
        check_pool_status()
        return
    tag = (os.environ.get("FLACAUD_TAG") or "").strip() or "auto"
    print(f"Deploy tidal only -> {host} (VPN 151.x NOT contacted; VPN_FIX ignored)")
    print(f"Registry mode enabled (FLACAUD_TAG={tag})")
    if os.environ.get("VPN_FIX"):
        print("Note: VPN_FIX is set but deploy_tidal.py never calls fix_vpn_server().")
    if os.environ.get("VPN_SSH_PASSWORD"):
        from scripts.check_vpn import main as check_vpn  # noqa: PLC0415

        print("Pre-deploy read-only VPN check…")
        check_vpn()
    deploy_tidal_server()
    smoke_tidal()
    verify_password_reset_mail_ready()
    print("Tidal deploy complete.")


if __name__ == "__main__":
    main()
