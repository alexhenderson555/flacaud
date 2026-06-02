import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
stdin, stdout, stderr = ssh.exec_command("docker ps -q | xargs -n 1 docker inspect --format '{{.State.Pid}} {{.Name}}' | grep 1083873")
sys.stdout.buffer.write(stdout.read())
ssh.close()
