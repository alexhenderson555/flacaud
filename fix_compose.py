import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)

cmd = """
cd /opt/tidal-dl-ru
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
if grep -q '^TIDAL_USE_POSTGRES=1' .env 2>/dev/null || grep -q '^DATABASE_URL=postgresql' .env 2>/dev/null; then
  COMPOSE="$COMPOSE -f docker-compose.postgres.yml"
fi
$COMPOSE up -d --remove-orphans
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Output:', stdout.read().decode())
print('Error:', stderr.read().decode())

ssh.close()
