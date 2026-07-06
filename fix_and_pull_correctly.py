import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
sftp = ssh.open_sftp()

local_path = os.path.join(os.getcwd(), 'repo.bundle')
remote_path = "/tmp/repo.bundle"
print("Uploading repo.bundle to /tmp...")
sftp.put(local_path, remote_path)

print("Applying bundle forcefully...")
cmd = "cd /opt/tidal-dl-ru && git reset --hard HEAD && git clean -fd && git pull /tmp/repo.bundle HEAD"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Git pull Output:', stdout.read().decode())
print('Git pull Error:', stderr.read().decode())

print("Restarting API container...")
ssh.exec_command('cd /opt/tidal-dl-ru && docker compose restart api')

print("Rebuilding frontend...")
cmd_build = "cd /opt/tidal-dl-ru && docker run --rm -v '/opt/tidal-dl-ru/frontend:/app' -w /app node:22-alpine sh -c 'npm ci && npm run build'"
stdin, stdout, stderr = ssh.exec_command(cmd_build)
print('Build Exit code:', stdout.channel.recv_exit_status())

sftp.close()
ssh.close()
