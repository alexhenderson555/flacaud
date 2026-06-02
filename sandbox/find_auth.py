import paramiko

OLD_IP = '151.243.177.88'
PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(OLD_IP, username='root', password=PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("find / -name tidal_auth.json 2>/dev/null")
    print("FIND:\n", stdout.read().decode(errors='ignore'))

    ssh.close()

if __name__ == '__main__':
    run()
