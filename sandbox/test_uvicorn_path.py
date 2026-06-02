import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker exec tidal-dl-ru-api-1 cat /app/.venv/bin/uvicorn")
sys.stdout.buffer.write(stdout.read())
ssh.close()
