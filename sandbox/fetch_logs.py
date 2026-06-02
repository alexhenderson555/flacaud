import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "cd /opt/tidal-dl-ru && docker compose logs --tail 100 api"
stdin, stdout, stderr = ssh.exec_command(cmd)

print("--- STDOUT ---")
print(stdout.read().decode())
print("--- STDERR ---")
print(stderr.read().decode())

ssh.close()
