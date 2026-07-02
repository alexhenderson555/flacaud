#!/usr/bin/env python3
import sys
import time
from pathlib import Path

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
now_ns = int(time.time() * 1e9)
start_ns = now_ns - int(3600 * 1e9)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)

cmd = f"""cd {DEPLOY_PATH} && COMPOSE='{cf}' && \
echo '=== server time ===' && date -u && \
echo '=== loki direct (1h, ns) ===' && \
$COMPOSE exec -T loki wget -qO- 'http://localhost:3100/loki/api/v1/query_range?query=%7Bservice%3D%22api%22%7D&limit=5&start={start_ns}&end={now_ns}' | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data',{{}}).get('result',[]); print('streams',len(r)); print('status',d.get('status')); print('error',d.get('message',''))" && \
echo '=== grafana proxy with start/end ===' && \
curl -sf -u admin:Henderson55 -G 'http://127.0.0.1:3000/api/datasources/proxy/uid/loki/loki/api/v1/query_range' \
  --data-urlencode 'query={{service="api"}}' --data-urlencode 'limit=5' \
  --data-urlencode 'start={start_ns}' --data-urlencode 'end={now_ns}' | \
python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data',{{}}).get('result',[]); print('grafana streams',len(r))" && \
echo '=== grafana datasources ===' && \
curl -sf -u admin:Henderson55 'http://127.0.0.1:3000/api/datasources' | python3 -c "import sys,json; [print(x.get('id'),x.get('name'),x.get('uid'),x.get('url')) for x in json.load(sys.stdin)]" && \
echo '=== promtail positions ===' && \
$COMPOSE exec -T promtail cat /tmp/positions.yaml 2>/dev/null | head -20
"""
_, stdout, stderr = ssh.exec_command(cmd, timeout=90)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err:
    print("stderr:", err[:800])
ssh.close()
