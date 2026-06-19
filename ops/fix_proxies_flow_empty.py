#!/usr/bin/env python3
import json
import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
cur = con.cursor()
n = 0
for pid, settings in cur.execute("SELECT id, settings FROM proxies"):
    data = json.loads(settings)
    changed = False
    if data.get("flow") in ("", "XTLSFlows.NONE", None):
        if "flow" in data:
            del data["flow"]
            changed = True
    if changed:
        cur.execute("UPDATE proxies SET settings=? WHERE id=?", (json.dumps(data), pid))
        n += 1
con.commit()
print("fixed", n, "proxies")
