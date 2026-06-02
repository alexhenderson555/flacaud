import paramiko
import time
from scp import SCPClient

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

print("Connecting to SSH...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

print("Connected! Creating directory /opt/tidal-dl-ru...")
stdin, stdout, stderr = ssh.exec_command("mkdir -p /opt/tidal-dl-ru")
stdout.read()

print("Uploading app.tar.gz...")
with SCPClient(ssh.get_transport()) as scp:
    scp.put("app.tar.gz", remote_path="/opt/tidal-dl-ru/")

print("Extracting and deploying...")
commands = [
    "cd /opt/tidal-dl-ru",
    "tar -xzf app.tar.gz",
    "docker compose up -d --build"
]

for cmd in commands:
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    # Read outputs to block until command finishes
    out = stdout.read().decode()
    err = stderr.read().decode()
    
    if out:
        print("Output:", out)
    if err:
        print("Error/Log:", err)

print("Deploy complete!")
ssh.close()
