#!/usr/bin/env python3
import sys
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
cmd = f"""cd {DEPLOY_PATH} && COMPOSE='{cf}' && \
echo '=== promtail tail ===' && $COMPOSE logs promtail --tail 40 && \
echo '=== loki labels ===' && $COMPOSE exec -T loki wget -qO- 'http://localhost:3100/loki/api/v1/labels' && echo && \
echo '=== service values ===' && $COMPOSE exec -T loki wget -qO- 'http://localhost:3100/loki/api/v1/label/service/values' && echo && \
echo '=== container values ===' && $COMPOSE exec -T loki wget -qO- 'http://localhost:3100/loki/api/v1/label/container/values' && echo && \
echo '=== sample query api ===' && $COMPOSE exec -T loki wget -qO- 'http://localhost:3100/loki/api/v1/query_range?query=%7Bservice%3D%22api%22%7D&limit=3' | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data',{{}}).get('result',[]); print('streams', len(r)); [print(s.get('stream',{{}}), (s.get('values') or [['']])[0][1][:120]) for s in r[:3]]"
"""
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
_, stdout, stderr = ssh.exec_command(cmd, timeout=90)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
if err:
    sys.stdout.buffer.write(err.encode("utf-8", errors="replace"))
ssh.close()
