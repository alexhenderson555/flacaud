import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "cd /opt/tidal-dl-ru && echo 'API_PORT=80' >> .env && docker compose up -d"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("Out:", stdout.read().decode())
print("Err:", stderr.read().decode())
ssh.close()
