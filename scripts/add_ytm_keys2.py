import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("46.17.102.157", username="root", password="***REMOVED-VPS-ROOT-PASSWORD***")

commands = [
    "grep -q '^GOOGLE_OAUTH_CLIENT_ID=' /opt/tidal-dl-ru/.env && sed -i 's|^GOOGLE_OAUTH_CLIENT_ID=.*|GOOGLE_OAUTH_CLIENT_ID=128717334061-m75drb0teb7g947fge6ot4of6r9tut25.apps.googleusercontent.com|' /opt/tidal-dl-ru/.env || echo 'GOOGLE_OAUTH_CLIENT_ID=128717334061-m75drb0teb7g947fge6ot4of6r9tut25.apps.googleusercontent.com' >> /opt/tidal-dl-ru/.env",
    "grep -q '^GOOGLE_OAUTH_CLIENT_SECRET=' /opt/tidal-dl-ru/.env && sed -i 's|^GOOGLE_OAUTH_CLIENT_SECRET=.*|GOOGLE_OAUTH_CLIENT_SECRET=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|' /opt/tidal-dl-ru/.env || echo 'GOOGLE_OAUTH_CLIENT_SECRET=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' >> /opt/tidal-dl-ru/.env",
    "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.postgres.yml -f docker-compose.observability.yml' && $COMPOSE restart api worker bot"
]

for cmd in commands:
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())

ssh.close()
print("Done!")
