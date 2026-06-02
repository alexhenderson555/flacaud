import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import sys
from tidal_dl_ru.server.app import app
for route in app.routes:
    if hasattr(route, 'path'):
        print(route.path)
"""
stdin, stdout, stderr = ssh.exec_command(f"docker exec tidal-dl-ru-api-1 python -c \"{script}\"")
sys.stdout.buffer.write(stdout.read())
ssh.close()
