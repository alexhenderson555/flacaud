import paramiko
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8000/api/artist/10915")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
