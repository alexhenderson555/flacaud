import os
import sys
from pathlib import Path

import dotenv

ROOT = Path(__file__).resolve().parent.parent
dotenv.load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT / "scripts"))
from _ops_env import tidal_host
from repair_servers import _ssh_run

host = tidal_host(required=False) or os.environ.get("TIDAL_HOST", "46.17.102.157")
user = os.environ.get("TIDAL_SSH_USER", "root")
pw = os.environ.get("TIDAL_SSH_PASSWORD", "") or os.environ.get("SSHPASS", "")

if not pw:
    print("No SSH password found in env.")
    sys.exit(1)

commands = [
    "grep -q '^GOOGLE_OAUTH_CLIENT_ID=' /opt/tidal-dl-ru/.env && sed -i 's|^GOOGLE_OAUTH_CLIENT_ID=.*|GOOGLE_OAUTH_CLIENT_ID=128717334061-m75drb0teb7g947fge6ot4of6r9tut25.apps.googleusercontent.com|' /opt/tidal-dl-ru/.env || echo 'GOOGLE_OAUTH_CLIENT_ID=128717334061-m75drb0teb7g947fge6ot4of6r9tut25.apps.googleusercontent.com' >> /opt/tidal-dl-ru/.env",
    "grep -q '^GOOGLE_OAUTH_CLIENT_SECRET=' /opt/tidal-dl-ru/.env && sed -i 's|^GOOGLE_OAUTH_CLIENT_SECRET=.*|GOOGLE_OAUTH_CLIENT_SECRET=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|' /opt/tidal-dl-ru/.env || echo 'GOOGLE_OAUTH_CLIENT_SECRET=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' >> /opt/tidal-dl-ru/.env",
    "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.postgres.yml -f docker-compose.observability.yml' && $COMPOSE restart api worker bot"
]

for cmd in commands:
    print(f"Running: {cmd}")
    _ssh_run(host, user, pw, cmd, timeout=120)

print("Done! Keys added and containers restarted.")
