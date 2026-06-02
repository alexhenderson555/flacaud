import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "cat /opt/tidal-dl-ru/src/tidal_dl_ru/server/app.py | grep -n 'SavedTrack'"
stdin, stdout, stderr = ssh.exec_command(cmd)

print(stdout.read().decode())

ssh.close()
