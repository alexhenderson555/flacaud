import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker logs --tail 200 tidal-dl-ru-worker-1")
logs = stdout.read().decode('utf-8') + stderr.read().decode('utf-8')
print("\n".join(logs.split("\n")[-100:]))
ssh.close()
