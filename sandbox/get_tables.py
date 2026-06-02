import sqlite3

def run():
    conn = sqlite3.connect('C:\\Users\\Alex\\Cursor\\tidal-dl-ru\\db.sqlite3')
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = c.fetchall()
    print(tables)
    
    for t in tables:
        if 'sub' in t[0] or 'prox' in t[0] or 'link' in t[0] or 'token' in t[0]:
            c.execute(f"PRAGMA table_info({t[0]})")
            print(t[0], c.fetchall())
            
    conn.close()

if __name__ == '__main__':
    run()
