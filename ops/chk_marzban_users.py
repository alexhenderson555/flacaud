import sqlite3

c = sqlite3.connect("/var/lib/marzban/db.sqlite3")

print("== proxies ==")
cols = [d[1] for d in c.execute("PRAGMA table_info(proxies)").fetchall()]
print("cols:", cols)
for row in c.execute("SELECT * FROM proxies"):
    print(dict(zip(cols, row)))

print("\n== exclude_inbounds_association ==")
for row in c.execute("SELECT * FROM exclude_inbounds_association"):
    print(row)

print("\n== system (sample) ==")
for row in c.execute("SELECT * FROM system LIMIT 5"):
    print(row)
