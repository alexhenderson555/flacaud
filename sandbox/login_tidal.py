import paramiko
import time

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

channel = ssh.invoke_shell()
channel.send("docker exec tidal-dl-ru-api-1 tidal-dl-ru login\n")
time.sleep(5) 

out = channel.recv(8192).decode()
print("Output:\n", out)

ssh.close()
