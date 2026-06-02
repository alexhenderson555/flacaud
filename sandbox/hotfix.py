import paramiko
from scp import SCPClient

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

print("Connecting to SSH...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

print("Uploading files directly...")
with SCPClient(ssh.get_transport()) as scp:
    scp.put(".env", remote_path="/opt/tidal-dl-ru/.env")
    scp.put("src/tidal_dl_ru/server/worker.py", remote_path="/opt/tidal-dl-ru/src/tidal_dl_ru/server/worker.py")

print("Restarting containers...")
cmd = "cd /opt/tidal-dl-ru && docker compose build worker bot && docker compose up -d worker bot"
stdin, stdout, stderr = ssh.exec_command(cmd)

out = stdout.read().decode()
err = stderr.read().decode()

if out: print("Out:", out)
if err: print("Err:", err)

print("Hotfix complete!")
ssh.close()
