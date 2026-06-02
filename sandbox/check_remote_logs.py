import paramiko
host = "151.243.177.88"
username = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=username, password=password)

stdin, stdout, stderr = ssh.exec_command("docker compose -f /opt/tidal-dl-ru/docker-compose.yml logs --tail=50 api")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()

