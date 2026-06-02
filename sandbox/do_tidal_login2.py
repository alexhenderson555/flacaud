import paramiko
import time
import os

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

channel = ssh.invoke_shell()
channel.send("docker exec tidal-dl-ru-api-1 tidal-dl-ru login\n")

print("Waiting for URL...")
time.sleep(3)
if channel.recv_ready():
    out = channel.recv(8192).decode()
    with open("tidal_login_url.txt", "w") as f:
        f.write(out)
    print("WROTE TO tidal_login_url.txt")
else:
    print("NO DATA")

ssh.close()
