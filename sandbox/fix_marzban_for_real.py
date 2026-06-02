import paramiko
import re

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    print("Restarting Marzban properly...")
    ssh.exec_command("cd /opt/marzban && docker compose up -d")
    
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban bash -c 'for u in alex-test friend-1 friend-2 friend-3 friend-4 friend-5; do marzban-cli user get $u | grep -A 10 vless:// ; done'")
    
    output = stdout.read().decode('utf-8', errors='ignore')
    print("\nLINKS:\n", output)
    ssh.close()

if __name__ == '__main__':
    run()
