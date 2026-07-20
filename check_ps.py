import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***')
stdin, stdout, stderr = client.exec_command('docker ps --format "{{.Names}}\t{{.Status}}"')
print(stdout.read().decode())
