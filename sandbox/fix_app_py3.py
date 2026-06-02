import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

py_script = """
import os
path = '/opt/tidal-dl-ru/src/tidal_dl_ru/server/app.py'
with open(path, 'r') as f:
    content = f.read()
content = content.replace('.parent.parent.parent.parent.parent', '.parent.parent.parent.parent')
with open(path, 'w') as f:
    f.write(content)
"""

cmd = f"python3 -c \"{py_script}\" && cd /opt/tidal-dl-ru && docker compose restart api"
print(f"Executing: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd)

out = stdout.read().decode()
err = stderr.read().decode()

if out: print("Out:", out)
if err: print("Err:", err)

ssh.close()
