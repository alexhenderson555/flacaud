#!/usr/bin/env python3
"""v2rayNG-safe VLESS REALITY links (no flow param)."""
import json
import sqlite3
import sys
import urllib.parse

PBK = "P1m6ERoeUmFmdUzmurYJ7CiUDsBGfZwSI4aLsIFnD28"
HOST = "151.243.177.88"
PORT = 8443
SNI = "www.microsoft.com"
FP = "chrome"
PREFIX = sys.argv[1] if len(sys.argv) > 1 else ""


def vless_link(uuid: str, name: str) -> str:
    q = urllib.parse.urlencode(
        {
            "encryption": "none",
            "security": "reality",
            "sni": SNI,
            "fp": FP,
            "pbk": PBK,
            "type": "tcp",
        }
    )
    frag = urllib.parse.quote(f"Marz ({name})")
    return f"vless://{uuid}@{HOST}:{PORT}?{q}#{frag}"


con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
cur = con.cursor()
for username, settings in cur.execute(
    """
    SELECT u.username, p.settings
    FROM users u
    JOIN proxies p ON p.user_id = u.id
    WHERE p.type = 'VLESS' AND u.status = 'active'
    ORDER BY u.username
    """
):
    if PREFIX and not username.startswith(PREFIX):
        continue
    uid = json.loads(settings)["id"]
    print(f"=== {username} ===")
    print(vless_link(uid, username))
    print()
