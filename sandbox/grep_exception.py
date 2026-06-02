import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "docker compose -f /opt/tidal-dl-ru/docker-compose.yml logs --tail 1000 api | grep -B 2 -A 30 'Exception in ASGI application'"
stdin, stdout, stderr = ssh.exec_command(cmd)

print(stdout.read().decode())

ssh.close()
