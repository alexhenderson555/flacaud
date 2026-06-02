import paramiko

OLD_IP = '151.243.177.88'
NEW_IP = '46.17.102.157'
PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    # 1. Download from old
    ssh_old = paramiko.SSHClient()
    ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_old.connect(OLD_IP, username='root', password=PASS, timeout=10)
    sftp_old = ssh_old.open_sftp()
    try:
        sftp_old.get("/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/tidal_auth.json", "tidal_auth.json")
        print("Downloaded tidal_auth.json from old server volume")
    except Exception as e:
        print("Error downloading from old server:", e)
    sftp_old.close()
    ssh_old.close()
    
    # 2. Upload to new
    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_IP, username='root', password=PASS, timeout=10)
    sftp_new = ssh_new.open_sftp()
    try:
        # Ensure dir exists
        sftp_new.put("tidal_auth.json", "/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/tidal_auth.json")
        print("Uploaded tidal_auth.json to new server volume")
    except Exception as e:
        print("Error uploading to new server:", e)
    sftp_new.close()
    
    # Restart containers to load the auth
    ssh_new.exec_command("cd /opt/tidal-dl-ru && docker compose restart api worker")
    print("Restarted containers")
    ssh_new.close()

if __name__ == '__main__':
    run()
