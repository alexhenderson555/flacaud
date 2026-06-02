import sqlite3

def run():
    conn = sqlite3.connect('C:\\Users\\Alex\\Cursor\\tidal-dl-ru\\db.sqlite3')
    c = conn.cursor()
    c.execute("SELECT * FROM inbounds")
    rows = c.fetchall()
    print(rows)
    conn.close()

if __name__ == '__main__':
    run()
