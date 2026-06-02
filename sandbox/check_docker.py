import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

stdin, stdout, stderr = ssh.exec_command("docker ps")
print("DOCKER PS:\n", stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("docker compose -f /opt/tidal-dl-ru/docker-compose.yml logs --tail=20")
print("DOCKER COMPOSE LOGS:\n", stdout.read().decode())

ssh.close()
