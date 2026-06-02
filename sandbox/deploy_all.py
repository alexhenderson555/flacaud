import os
import paramiko

# Create tarball of src and frontend/dist
print("Creating app.tar.gz...")
os.system("tar -czf app.tar.gz src Dockerfile docker-compose.yml .env frontend/dist")

host = "151.243.177.88"
username = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

print("Connecting to VPS...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=username, password=password)

print("Uploading app.tar.gz...")
sftp = ssh.open_sftp()
sftp.put("app.tar.gz", "/opt/tidal-dl-ru/app.tar.gz")
sftp.close()

print("Extracting and restarting Docker containers...")
cmd = "cd /opt/tidal-dl-ru && tar -xzf app.tar.gz && docker compose build && docker compose up -d"
print(f"Running: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f"Error: {err}")

ssh.close()
print("Deployment completed!")
