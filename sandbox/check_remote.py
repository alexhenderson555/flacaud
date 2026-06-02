import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "docker ps | grep api && grep 'SavedTrack(' /opt/tidal-dl-ru/src/tidal_dl_ru/server/app.py"
stdin, stdout, stderr = ssh.exec_command(cmd)

print(stdout.read().decode())
print(stderr.read().decode())

ssh.close()
