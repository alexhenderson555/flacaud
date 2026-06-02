import paramiko

OLD_IP = '151.243.177.88'
NEW_IP = '46.17.102.157'
PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh_old = paramiko.SSHClient()
    ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_old.connect(OLD_IP, username='root', password=PASS, timeout=10)
    sftp_old = ssh_old.open_sftp()
    for f in ["pool.db", "pool.key"]:
        try:
            sftp_old.get(f"/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/{f}", f)
            print(f"Downloaded {f} from old server volume")
        except Exception as e:
            print(f"Error downloading {f}:", e)
    sftp_old.close()
    ssh_old.close()
    
    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_IP, username='root', password=PASS, timeout=10)
    sftp_new = ssh_new.open_sftp()
    for f in ["pool.db", "pool.key"]:
        try:
            sftp_new.put(f, f"/var/lib/docker/volumes/tidal-dl-ru_pool-data/_data/{f}")
            print(f"Uploaded {f} to new server volume")
        except Exception as e:
            print(f"Error uploading {f}:", e)
    sftp_new.close()
    
    ssh_new.exec_command("cd /opt/tidal-dl-ru && docker compose restart api worker")
    print("Restarted containers")
    ssh_new.close()

if __name__ == '__main__':
    run()
