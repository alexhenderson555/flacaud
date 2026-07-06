import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
# We can't actually authorize without a user session, but we can verify the API is up
cmd = "curl -s http://127.0.0.1:8001/healthz"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Output:', stdout.read().decode())
