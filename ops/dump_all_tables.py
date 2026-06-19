import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1"):
    print("TABLE", name)
    cols = [d[1] for d in con.execute(f"PRAGMA table_info({name})")]
    print(" ", cols)
    try:
        n = con.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print("  rows:", n)
    except Exception as e:
        print("  err:", e)
