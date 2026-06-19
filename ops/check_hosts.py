#!/usr/bin/env python3
import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
print("hosts:")
for row in con.execute("SELECT id, inbound_tag, is_disabled, address, port, security FROM hosts"):
    print(row)
print("\nkey-1 user:")
for row in con.execute(
    "SELECT u.id, u.username, u.status FROM users u WHERE username='key-1'"
):
    print(row)
print("proxies:")
for row in con.execute(
    "SELECT p.id, p.type, p.settings FROM proxies p JOIN users u ON u.id=p.user_id WHERE u.username='key-1'"
):
    print(row)
