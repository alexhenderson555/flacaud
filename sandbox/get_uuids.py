import sqlite3
import json

def run():
    conn = sqlite3.connect('C:\\Users\\Alex\\Cursor\\tidal-dl-ru\\db.sqlite3')
    c = conn.cursor()
    c.execute("SELECT users.username, proxies.settings FROM users JOIN proxies ON users.id = proxies.user_id")
    for row in c.fetchall():
        username = row[0]
        settings = json.loads(row[1])
        uuid = settings.get('id')
        if uuid:
            print(f"USER: {username}")
            print(f"vless://{uuid}@46.17.102.157:8443?type=tcp&security=reality&pbk=QCGuKp-2JFfWDGNtiqSZAuSVF-or_7kPjX3ZxHcKhDg&sni=www.microsoft.com&fp=chrome&sid=&spx=%2F#{username}")
    conn.close()

if __name__ == '__main__':
    run()
