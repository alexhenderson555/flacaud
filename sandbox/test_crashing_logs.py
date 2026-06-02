import paramiko
import sys

host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker logs tidal-dl-ru-api-1 --tail 100")
print("API LOGS:\n" + stdout.read().decode())
stdin, stdout, stderr = ssh.exec_command("docker logs tidal-dl-ru-bot-1 --tail 100")
print("BOT LOGS:\n" + stdout.read().decode())
ssh.close()
