import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban bash -c 'for u in alex-test friend-1 friend-2 friend-3 friend-4 friend-5; do marzban-cli user get $u; done' > /root/links.txt")
    stdout.channel.recv_exit_status()
    
    sftp = ssh.open_sftp()
    sftp.get('/root/links.txt', 'links_output.txt')
    sftp.close()
    ssh.close()

if __name__ == '__main__':
    run()
