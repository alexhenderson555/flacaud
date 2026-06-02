import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "docker exec tidal-dl-ru-api-1 python -c 'from pathlib import Path; print(Path(\"/app/src/tidal_dl_ru/server/app.py\").parent.parent.parent.parent / \"frontend\" / \"dist\")'"
print(f"Executing: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd)
print("Output:", stdout.read().decode())
print("Error:", stderr.read().decode())
ssh.close()
