import sqlite3

def run():
    conn = sqlite3.connect('C:\\Users\\Alex\\Cursor\\tidal-dl-ru\\db.sqlite3')
    c = conn.cursor()
    c.execute("PRAGMA table_info(users)")
    for row in c.fetchall():
        print(row)
    c.execute("SELECT username, data_limit, used_traffic FROM users")
    for row in c.fetchall()[:5]:
        print(row)
    conn.close()

if __name__ == '__main__':
    run()
