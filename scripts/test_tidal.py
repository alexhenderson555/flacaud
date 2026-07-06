import os

import paramiko
from dotenv import load_dotenv

load_dotenv('.env.local')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password=os.environ.get('TIDAL_SSH_PASSWORD'), timeout=10)

py_script = """
import sys
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.pool import acquire
from tidal_dl_ru.providers.tidal.models import AudioQuality
try:
    acc, tokens = acquire()
    client = TidalClient(tokens=tokens)
    manifest = client.get_playback_manifest("42280209", AudioQuality.HIGH)
    print("Success!", manifest.urls[0] if manifest.urls else manifest)
except Exception as e:
    import traceback
    traceback.print_exc()
"""

stdin, stdout, stderr = ssh.exec_command('cd /opt/tidal-dl-ru && docker compose exec -T api python -')
stdin.write(py_script)
stdin.close()

print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
