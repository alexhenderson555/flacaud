import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
cmd = "docker ps | grep api"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Output:', stdout.read().decode())
