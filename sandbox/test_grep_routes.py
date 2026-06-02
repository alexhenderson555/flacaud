import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker exec tidal-dl-ru-api-1 grep -B 1 'def get_artist_api' /app/src/tidal_dl_ru/server/app.py")
sys.stdout.buffer.write(stdout.read())
ssh.close()
