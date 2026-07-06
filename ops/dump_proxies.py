import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
for row in con.execute("SELECT id, user_id, type, settings FROM proxies"):
    print(row)
