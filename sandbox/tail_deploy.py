import paramiko
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("tail -n 20 /opt/tidal-dl-ru/deploy.log")
print(stdout.read().decode())
ssh.close()
