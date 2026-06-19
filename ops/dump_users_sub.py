import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
cols = [d[1] for d in con.execute("PRAGMA table_info(users)").fetchall()]
print("cols:", cols)
for row in con.execute("SELECT * FROM users WHERE id=1"):
    print(dict(zip(cols, row)))
