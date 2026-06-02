import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "cd /opt/tidal-dl-ru && echo 'API_PORT=80' >> .env && docker compose up -d --build api"
print(f"Executing: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd)

out = stdout.read().decode()
err = stderr.read().decode()

if out: print("Out:", out)
if err: print("Err:", err)

ssh.close()
