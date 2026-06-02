import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban marzban-cli user get alex-test > /root/alex.txt")
    stdout.channel.recv_exit_status()
    
    sftp = ssh.open_sftp()
    sftp.get('/root/alex.txt', 'alex.txt')
    
    ssh.close()

if __name__ == '__main__':
    run()
