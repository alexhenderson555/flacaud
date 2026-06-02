import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("151.243.177.88", username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("cd /opt/tidal-dl-ru && docker compose ps")
print(stdout.read().decode())
print(stderr.read().decode())

