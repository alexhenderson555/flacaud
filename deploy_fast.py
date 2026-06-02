import paramiko
from scp import SCPClient
import sys

host = "46.17.102.157"
user = "root"
password = "***REMOVED-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

print("Uploading app.tar.gz...")
ssh.exec_command("mkdir -p /opt/tidal-dl-ru")
with SCPClient(ssh.get_transport()) as scp:
    scp.put("app.tar.gz", remote_path="/opt/tidal-dl-ru/")

print("Extracting and building...")
cmd = "cd /opt/tidal-dl-ru && tar -xzf app.tar.gz && docker compose down || true && docker rm -f tidal-dl-ru-api-1 tidal-dl-ru-worker-1 tidal-dl-ru-bot-1 || true && docker compose build api worker bot && docker compose up -d --remove-orphans"
stdin, stdout, stderr = ssh.exec_command(cmd)

for line in iter(stdout.readline, ""):
    print(line, end="")
    sys.stdout.flush()

for line in iter(stderr.readline, ""):
    print(line, end="")
    sys.stdout.flush()

print("Deployed successfully!")
ssh.close()
