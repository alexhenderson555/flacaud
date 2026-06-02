import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("curl -v http://127.0.0.1:8000/dashboard/")
    print("CURL LOCAL:\n", stdout.read().decode())
    
    _, stdout, _ = ssh.exec_command("curl -v http://46.17.102.157:8000/dashboard/")
    print("CURL EXTERNAL:\n", stdout.read().decode())
    
    ssh.close()

if __name__ == '__main__':
    run()
