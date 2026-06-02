import paramiko

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

cmd = "cd /opt/tidal-dl-ru && export API_PORT=80 && docker compose up -d"
print(f"Executing: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd)

out = stdout.read().decode()
err = stderr.read().decode()

if out:
    print("Output:", out)
if err:
    print("Error:", err)

ssh.close()
