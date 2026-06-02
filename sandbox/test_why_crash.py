import paramiko
import sys

host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker compose -f /opt/tidal-dl-ru/docker-compose.yml logs api")
print("API LOGS:\n" + stdout.read().decode())
print("API STDERR:\n" + stderr.read().decode())
stdin, stdout, stderr = ssh.exec_command("docker compose -f /opt/tidal-dl-ru/docker-compose.yml ps -a")
print("PS:\n" + stdout.read().decode())
ssh.close()
