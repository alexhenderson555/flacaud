#!/usr/bin/env python3
import base64
import re
import subprocess

USERS = ["alex-test", "friend-1", "friend-2", "friend-3", "friend-4", "friend-5"]


def marzban_cli(args: list[str], username: str) -> str:
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "marzban", "marzban-cli", *args],
        input=f"{username}\n",
        cwd="/opt/marzban",
        capture_output=True,
        text=True,
        timeout=120,
    )
    return proc.stdout + proc.stderr


def extract_url(text: str) -> str | None:
    m = re.search(r"https://\S+", text)
    return m.group(0) if m else None


def fetch_vless(sub_url: str) -> str | None:
    proc = subprocess.run(
        ["curl", "-sk", sub_url],
        capture_output=True,
        timeout=30,
    )
    if not proc.stdout:
        return None
    try:
        raw = base64.b64decode(proc.stdout, validate=False)
        line = raw.decode("utf-8", errors="replace").strip().splitlines()[0]
        if line.startswith("vless://"):
            return line
    except Exception:
        pass
    return None


def main() -> None:
    for user in USERS:
        print(f"=== {user} ===")
        out = marzban_cli(["subscription", "get-link"], user)
        sub = extract_url(out)
        if not sub:
            print("SUB: (failed)")
            print()
            continue
        print(f"SUB: {sub}")
        vless = fetch_vless(sub)
        if vless:
            print(f"VLESS: {vless}")
        print()


if __name__ == "__main__":
    main()
