import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)

print("Rebuilding API container...")
cmd = "cd /opt/tidal-dl-ru && docker compose build api && docker compose up -d --remove-orphans api"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Build Exit code:', stdout.channel.recv_exit_status())

ssh.close()
