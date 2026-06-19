import json
import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3", timeout=60)
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA busy_timeout=60000")
cur = con.cursor()
n = 0
for pid, settings in cur.execute("SELECT id, settings FROM proxies WHERE type='VLESS'"):
    data = json.loads(settings)
    if "flow" in data:
        data.pop("flow")
        cur.execute("UPDATE proxies SET settings=? WHERE id=?", (json.dumps(data), pid))
        n += 1
con.commit()
print("cleared flow on", n, "proxies")
con.close()
