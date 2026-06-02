import paramiko

OLD_IP = '151.243.177.88'
OLD_PASS = '***REMOVED-OLD-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(OLD_IP, username='root', password=OLD_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose up -d")
    print("START LOGS:\n", stdout.read().decode())
    
    # Get the OLD links from the old server database directly to be absolutely sure
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban bash -c 'for u in alex-test friend-1 friend-2 friend-3 friend-4 friend-5; do marzban-cli user get $u | grep -A 10 vless:// ; done'")
    print("\nOLD LINKS:\n", stdout.read().decode(errors='ignore'))

    ssh.close()

if __name__ == '__main__':
    run()
