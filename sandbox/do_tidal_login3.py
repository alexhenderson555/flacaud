import paramiko
import time
import re

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    channel = ssh.invoke_shell()
    channel.send("cd /opt/tidal-dl-ru && docker compose exec api tidal-dl-ru login\n")
    
    output = ""
    for _ in range(30):
        if channel.recv_ready():
            data = channel.recv(4096).decode(errors='ignore')
            output += data
            print(data, end="")
            if "https://" in data:
                # Found the URL, stop reading, let user see it
                pass
        time.sleep(1)
    
    with open("tidal_login_url.txt", "w") as f:
        f.write(output)

    ssh.close()

if __name__ == '__main__':
    run()
