import paramiko
import time
import os

OLD_IP = '151.243.177.88'
OLD_PASS = '***REMOVED-OLD-VPS-ROOT-PASSWORD***'

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run_migration():
    print("Connecting to OLD VPS to create backup...")
    ssh_old = paramiko.SSHClient()
    ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_old.connect(OLD_IP, username='root', password=OLD_PASS, timeout=10)
    
    # Stop Marzban to ensure database is not locked/corrupt
    ssh_old.exec_command("cd /opt/marzban && docker compose down")
    time.sleep(5)
    
    # Create backup
    print("Taring Marzban folders...")
    _, stdout, _ = ssh_old.exec_command("tar -czvf /root/marzban_backup.tar.gz /opt/marzban /var/lib/marzban")
    print(stdout.read().decode())
    
    # Download backup to local
    print("Downloading backup locally...")
    sftp_old = ssh_old.open_sftp()
    sftp_old.get("/root/marzban_backup.tar.gz", "marzban_backup.tar.gz")
    sftp_old.close()
    
    # Start Marzban back up on old just in case they need it while DNS updates
    ssh_old.exec_command("cd /opt/marzban && docker compose up -d")
    ssh_old.close()
    
    print("Connecting to NEW VPS to upload backup...")
    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    print("Uploading backup to new VPS...")
    sftp_new = ssh_new.open_sftp()
    sftp_new.put("marzban_backup.tar.gz", "/root/marzban_backup.tar.gz")
    sftp_new.close()
    
    print("Extracting and starting Marzban on new VPS...")
    commands = [
        "tar -xzvf /root/marzban_backup.tar.gz -C /",
        "cd /opt/marzban && docker compose pull && docker compose up -d"
    ]
    for cmd in commands:
        _, stdout, stderr = ssh_new.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print(f"Error running {cmd}: {stderr.read().decode()}")
        else:
            print(f"Success: {cmd}")
            
    ssh_new.close()
    print("Migration complete!")

if __name__ == '__main__':
    run_migration()
