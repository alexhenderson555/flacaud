import paramiko

OLD_IP = '151.243.177.88'
NEW_IP = '46.17.102.157'
PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh_old = paramiko.SSHClient()
    ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_old.connect(OLD_IP, username='root', password=PASS, timeout=10)
    sftp_old = ssh_old.open_sftp()
    try:
        sftp_old.get("/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/tokens.json", "tokens.json")
        print("Downloaded tokens.json from old server volume")
    except Exception as e:
        print("Error downloading from old server:", e)
    sftp_old.close()
    ssh_old.close()
    
    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_IP, username='root', password=PASS, timeout=10)
    sftp_new = ssh_new.open_sftp()
    try:
        sftp_new.put("tokens.json", "/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/tokens.json")
        print("Uploaded tokens.json to new server volume")
    except Exception as e:
        print("Error uploading to new server:", e)
    sftp_new.close()
    
    ssh_new.exec_command("cd /opt/tidal-dl-ru && docker compose restart api worker")
    print("Restarted containers")
    ssh_new.close()

if __name__ == '__main__':
    run()
