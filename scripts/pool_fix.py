import os

import paramiko
from dotenv import load_dotenv

load_dotenv('.env.local')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('46.17.102.157', username='root', password=os.environ.get('TIDAL_SSH_PASSWORD'), timeout=10)

py_script = """
from tidal_dl_ru.providers.tidal.pool import list_accounts, revive
for acc in list_accounts():
    print(acc.id, acc.status, acc.label)
    if acc.status == "banned":
        revive(acc.id)
        print("Revived", acc.id)
"""

stdin, stdout, stderr = ssh.exec_command('cd /opt/tidal-dl-ru && docker compose exec -T api python -')
stdin.write(py_script)
stdin.close()

print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
