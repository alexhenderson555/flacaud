#!/usr/bin/env python3
import os

import paramiko

host = os.environ.get("TIDAL_HOST", os.environ.get("DEPLOY_HOST", "46.17.102.157"))
pw = os.environ["TIDAL_SSH_PASSWORD"]
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password=pw, timeout=30)
_, stdout, _ = ssh.exec_command(
    "cd /opt/tidal-dl-ru && docker compose exec -T api "
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/downloads',
    timeout=60,
)
print(stdout.read().decode().strip())
ssh.close()
