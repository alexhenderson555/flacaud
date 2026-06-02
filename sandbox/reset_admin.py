import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    # Try to reset admin password
    _, stdout, stderr = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban marzban-cli admin update admin -p Systtech2026")
    print("STDOUT:", stdout.read().decode(errors='ignore'))
    print("STDERR:", stderr.read().decode(errors='ignore'))
    
    ssh.close()

if __name__ == '__main__':
    run()
