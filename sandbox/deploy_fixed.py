import paramiko
from scp import SCPClient

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

with SCPClient(ssh.get_transport()) as scp:
    scp.put("app.tar.gz", remote_path="/opt/tidal-dl-ru/")

cmd = "cd /opt/tidal-dl-ru && tar -xzf app.tar.gz && docker compose up -d --build"
stdin, stdout, stderr = ssh.exec_command(cmd)

out = stdout.read().decode()
err = stderr.read().decode()
print("Out:", out)
print("Err:", err)

ssh.close()
