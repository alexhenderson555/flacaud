import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
cmd = "cd /opt/tidal-dl-ru && git log -n 3 --oneline && cat src/tidal_dl_ru/providers/connectors/ytmusic_connector.py | grep -A 5 oauth_config"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Output:', stdout.read().decode())
