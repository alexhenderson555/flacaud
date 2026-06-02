import paramiko

OLD_IP = '151.243.177.88'
OLD_PASS = '***REMOVED-OLD-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(OLD_IP, username='root', password=OLD_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cat /opt/marzban/.env | grep -i port")
    print("OLD ENV:\n", stdout.read().decode())
    
    _, stdout, _ = ssh.exec_command("iptables -S")
    print("OLD IPTABLES:\n", stdout.read().decode())
    
    ssh.close()

if __name__ == '__main__':
    run()
