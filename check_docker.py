import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***')
stdin, stdout, stderr = client.exec_command('ps aux | grep docker')
print(stdout.read().decode())
