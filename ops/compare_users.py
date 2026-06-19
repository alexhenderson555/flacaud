#!/usr/bin/env python3
import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
for name in ("friend-1", "key-1"):
    print(f"\n=== {name} ===")
    u = con.execute("SELECT * FROM users WHERE username=?", (name,)).fetchone()
    cols = [d[1] for d in con.execute("PRAGMA table_info(users)")]
    if u:
        print(dict(zip(cols, u)))
    for row in con.execute(
        "SELECT p.id, p.type, p.settings FROM proxies p JOIN users u ON u.id=p.user_id WHERE u.username=?",
        (name,),
    ):
        print("proxy", row)
    for row in con.execute(
        "SELECT * FROM exclude_inbounds_association e JOIN proxies p ON p.id=e.proxy_id "
        "JOIN users u ON u.id=p.user_id WHERE u.username=?",
        (name,),
    ):
        print("exclude", row)
