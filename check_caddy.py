import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***')
stdin, stdout, stderr = client.exec_command('docker logs --tail 20 tidal-dl-ru-caddy-1')
print("CADDY STDOUT:", stdout.read().decode())
print("CADDY STDERR:", stderr.read().decode())
