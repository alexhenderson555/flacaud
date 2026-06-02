import paramiko

OLD_IP = '151.243.177.88'
OLD_PASS = '***REMOVED-OLD-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(OLD_IP, username='root', password=OLD_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose ps")
    print("DOCKER PS:\n", stdout.read().decode())
    
    _, stdout, _ = ssh.exec_command("ss -tulpn | grep 8443")
    print("SS 8443:\n", stdout.read().decode())

    ssh.close()

if __name__ == '__main__':
    run()
