import sqlite3
import json

def run():
    conn = sqlite3.connect('C:\\Users\\Alex\\Cursor\\tidal-dl-ru\\db.sqlite3')
    c = conn.cursor()
    c.execute("SELECT users.username, proxies.type, proxies.settings FROM users JOIN proxies ON users.id = proxies.user_id")
    for row in c.fetchall():
        if row[0] == 'alex-test':
            print(row[1], row[2])
    conn.close()

if __name__ == '__main__':
    run()
