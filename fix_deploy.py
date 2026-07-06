import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
cmd = """
cd /opt/tidal-dl-ru
git fetch origin
git reset --hard origin/master
docker run --rm -v "/opt/tidal-dl-ru/frontend:/app" -w /app node:22-alpine sh -c "npm ci && npm run build"
"""
print('Starting deploy...')
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Exit code:', stdout.channel.recv_exit_status())
print('Output:', stdout.read().decode())
print('Error:', stderr.read().decode())
