import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
cmd = """
cd /opt/tidal-dl-ru
grep -q '^GOOGLE_OAUTH_CLIENT_ID=' .env && sed -i 's|^GOOGLE_OAUTH_CLIENT_ID=.*|GOOGLE_OAUTH_CLIENT_ID=128717334061-0udshh5i50dpt4i8g8cnb4an41t9g1bo.apps.googleusercontent.com|' .env || echo 'GOOGLE_OAUTH_CLIENT_ID=128717334061-0udshh5i50dpt4i8g8cnb4an41t9g1bo.apps.googleusercontent.com' >> .env
grep -q '^GOOGLE_OAUTH_CLIENT_SECRET=' .env && sed -i 's|^GOOGLE_OAUTH_CLIENT_SECRET=.*|GOOGLE_OAUTH_CLIENT_SECRET=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|' .env || echo 'GOOGLE_OAUTH_CLIENT_SECRET=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' >> .env
docker compose restart api
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Exit code:', stdout.channel.recv_exit_status())
print('Output:', stdout.read().decode())
print('Error:', stderr.read().decode())
