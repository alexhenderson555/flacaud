#!/usr/bin/env python3
import sqlite3

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
cur = con.cursor()
rows = cur.execute(
    """
    SELECT e.proxy_id, e.inbound_tag, u.username
    FROM exclude_inbounds_association e
    JOIN proxies p ON p.id = e.proxy_id
    JOIN users u ON u.id = p.user_id
    WHERE u.username LIKE 'key-%'
    """
).fetchall()
print("will delete", len(rows), "rows:", rows)
cur.execute(
    """
    DELETE FROM exclude_inbounds_association
    WHERE proxy_id IN (
        SELECT p.id FROM proxies p
        JOIN users u ON u.id = p.user_id
        WHERE u.username LIKE 'key-%'
    )
    """
)
con.commit()
print("done, remaining exclusions for key-*:",
      cur.execute(
          "SELECT COUNT(*) FROM exclude_inbounds_association e "
          "JOIN proxies p ON p.id=e.proxy_id JOIN users u ON u.id=p.user_id "
          "WHERE u.username LIKE 'key-%'"
      ).fetchone()[0])
