#!/usr/bin/env python3
"""Add Tidal account to production pool from PKCE, TV device flow, or refresh token.

Examples:
  python scripts/add_tidal_to_pool.py url
  python scripts/add_tidal_to_pool.py complete "https://tidal.com/android/login/auth?code=..."
  python scripts/add_tidal_to_pool.py device-url
  python scripts/add_tidal_to_pool.py device-wait --label hifi-tv
  python scripts/add_tidal_to_pool.py token --label hifi-new --refresh-token "..."
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tidal_dl_ru.providers.tidal.auth import (  # noqa: E402
    AuthError,
    PendingAuthorization,
    extract_code_from_url,
    pkce_exchange_code,
    pkce_login_url,
    poll_token,
    request_device_code,
)

VERIFIER_FILE = ROOT / "_pkce_verifier.txt"
DEVICE_FILE = ROOT / "_device_flow.json"


def cmd_url() -> int:
    url, verifier = pkce_login_url()
    VERIFIER_FILE.write_text(verifier, encoding="utf-8")
    print(url)
    print("\nAfter login, copy the full redirect URL and run:")
    print('  python scripts/add_tidal_to_pool.py complete "<paste-url-here>"')
    return 0


def cmd_complete(redirect_url: str, label: str, quota: int) -> int:
    verifier = VERIFIER_FILE.read_text(encoding="utf-8").strip()
    code = extract_code_from_url(redirect_url)
    with httpx.Client(timeout=30.0) as http:
        tokens = pkce_exchange_code(http, code, verifier)
    print(f"OK user_id={tokens.user_id} country={tokens.country_code}")
    return _add_to_server(label, tokens.refresh_token, tokens.country_code, tokens.user_id, quota)


def cmd_token(label: str, refresh_token: str, quota: int) -> int:
    return _add_to_server(label, refresh_token, None, None, quota)


def cmd_device_url() -> int:
    with httpx.Client(timeout=30.0) as http:
        device = request_device_code(http)
    url = (
        device.verification_uri_complete
        if device.verification_uri_complete.startswith("http")
        else f"https://{device.verification_uri_complete}"
    )
    DEVICE_FILE.write_text(
        json.dumps(
            {
                "device_code": device.device_code,
                "expires_at": time.time() + device.expires_in,
                "interval": max(2, device.interval),
            }
        ),
        encoding="utf-8",
    )
    print(url)
    print(f"\nCode (if link fails): {device.user_code}")
    print(f"Valid for {device.expires_in}s. After approving in browser, run:")
    print("  python scripts/add_tidal_to_pool.py device-wait --label hifi-tv")
    return 0


def cmd_device_wait(label: str, quota: int) -> int:
    if not DEVICE_FILE.is_file():
        print("Run device-url first.", file=sys.stderr)
        return 1
    meta = json.loads(DEVICE_FILE.read_text(encoding="utf-8"))
    device_code = meta["device_code"]
    deadline = meta["expires_at"]
    interval = meta.get("interval", 3)
    print(f"Waiting for approval on pool label {label!r}…")
    with httpx.Client(timeout=30.0) as http:
        while time.time() < deadline:
            try:
                tokens = poll_token(http, device_code)
                break
            except PendingAuthorization:
                time.sleep(interval)
                continue
            except AuthError as e:
                print(f"Auth error: {e}", file=sys.stderr)
                return 1
        else:
            print("Device code expired. Run device-url again.", file=sys.stderr)
            return 1
    DEVICE_FILE.unlink(missing_ok=True)
    print(f"OK user_id={tokens.user_id} country={tokens.country_code}")
    return _add_to_server(label, tokens.refresh_token, tokens.country_code, tokens.user_id, quota)


def _add_to_server(
    label: str,
    refresh_token: str,
    country_code: str | None,
    user_id: int | None,
    quota: int,
) -> int:
    sys.path.insert(0, str(ROOT))
    import base64

    from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

    remote = f"""
import tidal_dl_ru.providers.tidal.pool as p
acc = p.add_account({label!r}, {refresh_token!r}, country_code={country_code!r}, user_id={user_id!r}, daily_quota={quota})
print("ADDED", acc.id, acc.label, acc.country_code)
"""
    blob = base64.b64encode(remote.encode()).decode()
    inner = f"import base64; exec(base64.b64decode('{blob}').decode())"
    cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
    pw = _password("TIDAL_SSH_PASSWORD")
    return _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("url", help="Print PKCE login URL")
    p_complete = sub.add_parser("complete", help="Finish PKCE from redirect URL")
    p_complete.add_argument("redirect_url")
    p_complete.add_argument("--label", default="hifi-new")
    p_complete.add_argument("--quota", type=int, default=200)
    p_token = sub.add_parser("token", help="Add by refresh token")
    p_token.add_argument("--label", default="hifi-new")
    p_token.add_argument("--refresh-token", required=True)
    p_token.add_argument("--quota", type=int, default=200)
    sub.add_parser("device-url", help="Start TV device flow — prints link.tidal.com URL")
    p_wait = sub.add_parser("device-wait", help="Poll after device-url approval, add to pool")
    p_wait.add_argument("--label", default="hifi-tv")
    p_wait.add_argument("--quota", type=int, default=200)
    args = parser.parse_args()

    if args.cmd == "url":
        return cmd_url()
    if args.cmd == "complete":
        return cmd_complete(args.redirect_url, args.label, args.quota)
    if args.cmd == "token":
        return cmd_token(args.label, args.refresh_token, args.quota)
    if args.cmd == "device-url":
        return cmd_device_url()
    if args.cmd == "device-wait":
        return cmd_device_wait(args.label, args.quota)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
