#!/usr/bin/env python3
"""On VPN host: create users + export v2rayNG-safe keys (host /root/)."""
import json
import re
import sqlite3
import subprocess
import sys
import urllib.parse

PBK = "P1m6ERoeUmFmdUzmurYJ7CiUDsBGfZwSI4aLsIFnD28"
HOST = "151.243.177.88"
PORT = 8443
COMPOSE_DIR = "/opt/marzban"


def vless_link(uuid: str, name: str) -> str:
    q = urllib.parse.urlencode(
        {
            "encryption": "none",
            "security": "reality",
            "sni": "www.microsoft.com",
            "fp": "chrome",
            "pbk": PBK,
            "type": "tcp",
        }
    )
    frag = urllib.parse.quote(f"Marz ({name})")
    return f"vless://{uuid}@{HOST}:{PORT}?{q}#{frag}"


def marzban_cli(args: list[str], username: str = "") -> str:
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "marzban", "marzban-cli", *args],
        input=f"{username}\n" if username else None,
        cwd=COMPOSE_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return proc.stdout + proc.stderr


def get_sub_link(username: str) -> str | None:
    out = marzban_cli(["subscription", "get-link"], username)
    m = re.search(r"https://\S+", out)
    return m.group(0) if m else None


def create_users(count: int, start: int) -> list[str]:
    script = f"""
import asyncio
from app.db import crud, GetDB
from app.models.proxy import ProxyTypes
from app.models.user import UserCreate, UserStatus

async def run():
    names = []
    async with GetDB() as db:
        admin = await crud.get_admin(db, "admin")
        for i in range({start}, {start + count}):
            username = f"key-{{i}}"
            if await crud.get_user(db, username):
                names.append(username)
                continue
            u = UserCreate(username=username, status=UserStatus.active, proxies={{ProxyTypes.VLESS: {{}}}})
            await crud.create_user(db, u, admin)
            names.append(username)
    print(",".join(names))

asyncio.run(run())
"""
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "marzban", "python3", "-c", script],
        cwd=COMPOSE_DIR,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        raise SystemExit(proc.returncode)
    line = proc.stdout.strip().splitlines()[-1]
    return [n for n in line.split(",") if n]


def export_keys(usernames: list[str]) -> None:
    con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
    for name in usernames:
        row = con.execute(
            """
            SELECT p.settings FROM users u
            JOIN proxies p ON p.user_id = u.id
            WHERE u.username = ? AND p.type = 'VLESS'
            """,
            (name,),
        ).fetchone()
        if not row:
            print(f"=== {name} === MISSING\n")
            continue
        uid = json.loads(row[0])["id"]
        sub = get_sub_link(name)
        print(f"=== {name} ===")
        if sub:
            print(f"SUB: {sub}")
        print(f"VLESS: {vless_link(uid, name)}")
        print()


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    names = create_users(count, start)
    subprocess.run(
        ["docker", "compose", "-f", f"{COMPOSE_DIR}/docker-compose.yml", "restart", "marzban"],
        check=True,
        timeout=60,
    )
    import time

    time.sleep(12)
    export_keys(names)


if __name__ == "__main__":
    main()
