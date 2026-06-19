import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
print("== admins ==")
for r in con.execute("SELECT id, username FROM admins"):
    print(r)
print("== proxies ==")
for r in con.execute("SELECT id, user_id, type, settings FROM proxies"):
    print(r)
print("== inbounds ==")
for r in con.execute("SELECT * FROM inbounds"):
    print(r)
