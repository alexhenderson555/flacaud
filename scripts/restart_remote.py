import os

import paramiko
from dotenv import load_dotenv

load_dotenv('.env.local')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password=os.environ.get('TIDAL_SSH_PASSWORD'), timeout=10)

cmd = "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.postgres.yml' && eval $COMPOSE up -d --remove-orphans && eval $COMPOSE restart caddy api bot && echo Done!"
print('Running:', cmd)
_, stdout, stderr = ssh.exec_command(cmd)

for line in stdout: print('STDOUT:', line.strip())
for line in stderr: print('STDERR:', line.strip())

print('Exit status:', stdout.channel.recv_exit_status())
ssh.close()
