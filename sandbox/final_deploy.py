import paramiko
from scp import SCPClient
import sys

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

print("Uploading app.tar.gz...", flush=True)
with SCPClient(ssh.get_transport()) as scp:
    scp.put("app.tar.gz", remote_path="/opt/tidal-dl-ru/")

print("Extracting and running build detached...", flush=True)
cmd = "cd /opt/tidal-dl-ru && tar -xzf app.tar.gz && nohup sh -c 'docker compose build && docker compose up -d' > deploy.log 2>&1 &"
stdin, stdout, stderr = ssh.exec_command(cmd)

# wait for command to be sent and return
out = stdout.read().decode()
err = stderr.read().decode()

print("Deployed to background!")
ssh.close()
