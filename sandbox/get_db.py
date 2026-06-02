import paramiko
import sqlite3
import json

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    sftp = ssh.open_sftp()
    sftp.get('/var/lib/marzban/db.sqlite3', 'db.sqlite3')
    sftp.close()
    ssh.close()
    
    conn = sqlite3.connect('db.sqlite3')
    c = conn.cursor()
    c.execute("SELECT username, links FROM users")
    rows = c.fetchall()
    for row in rows:
        print(f"USER: {row[0]}")
        links = json.loads(row[1]) if row[1] else []
        for link in links:
            print(link)
        print("-" * 40)
    conn.close()

if __name__ == '__main__':
    run()
