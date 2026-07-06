import paramiko
import os
import subprocess

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password='***REMOVED-VPS-ROOT-PASSWORD***', timeout=10)
sftp = ssh.open_sftp()

files = subprocess.check_output(['git', 'ls-files']).decode('utf-8').split('\n')
for f in files:
    f = f.strip()
    if not f: continue
    
    # We only care about recently modified files
    # Actually let's just upload ytmusic_connector.py, usePlaybackQuality.js, playerStore.js, libraryStore.js
    # and any other files modified in the last 5 commits
    pass

files_to_update = [
    'src/tidal_dl_ru/providers/connectors/ytmusic_connector.py',
    'frontend/src/hooks/usePlaybackQuality.js',
    'frontend/src/store/playerStore.js'
]

for f in files_to_update:
    local_path = os.path.join(os.getcwd(), f)
    remote_path = f"/opt/tidal-dl-ru/{f}"
    print(f"Uploading {f}...")
    sftp.put(local_path, remote_path)

print("Restarting API container...")
ssh.exec_command('docker compose restart api')

print("Rebuilding frontend...")
cmd = "cd /opt/tidal-dl-ru && docker run --rm -v '/opt/tidal-dl-ru/frontend:/app' -w /app node:22-alpine sh -c 'npm ci && npm run build'"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('Exit code:', stdout.channel.recv_exit_status())

sftp.close()
ssh.close()
