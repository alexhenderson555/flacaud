#!/usr/bin/env python3
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)
import paramiko

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, compose_files

pw = _password("TIDAL_SSH_PASSWORD")
cf = compose_files()

queries = [
    '{service="api"}',
    '{service="api"} |= ""',
    '{container="tidal-dl-ru-api-1"}',
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)

for q in queries:
    enc = quote(q, safe="")
    cmd = (
        f"cd {DEPLOY_PATH} && COMPOSE='{cf}' && "
        f"$COMPOSE exec -T loki wget -qO- "
        f"'http://localhost:3100/loki/api/v1/query_range?query={enc}&limit=5&start=$(date -d \"-1 hour\" +%s)000000000' "
        f"| python3 -c \"import sys,json; d=json.load(sys.stdin); r=d.get('data',{{}}).get('result',[]); print('{q} ->', len(r), 'streams')\""
    )
    _, stdout, _ = ssh.exec_command(cmd, timeout=60)
    print(stdout.read().decode("utf-8", errors="replace").strip())

# grafana proxy test
cmd2 = (
    f"cd {DEPLOY_PATH} && COMPOSE='{cf}' && "
    "curl -sf -u admin:Henderson55 -G 'http://127.0.0.1:3000/api/datasources/proxy/uid/loki/loki/api/v1/query_range' "
    "--data-urlencode 'query={service=\"api\"}' --data-urlencode 'limit=3' | "
    "python3 -c \"import sys,json; d=json.load(sys.stdin); print('grafana proxy streams', len(d.get('data',{}).get('result',[])))\""
)
_, stdout, stderr = ssh.exec_command(cmd2, timeout=60)
print(stdout.read().decode("utf-8", errors="replace").strip())
err = stderr.read().decode("utf-8", errors="replace").strip()
if err:
    print("err:", err[:500])
ssh.close()
