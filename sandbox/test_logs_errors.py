import paramiko
import sys

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "docker logs tidal-dl-ru-api-1 --tail 500"
stdin, stdout, stderr = ssh.exec_command(cmd)

lines = stdout.readlines() + stderr.readlines()
for line in lines[-100:]:
    sys.stdout.write(line)

ssh.close()
