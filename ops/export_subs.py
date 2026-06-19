#!/usr/bin/env python3
import re
import subprocess
import sys

PREFIX = sys.argv[1] if len(sys.argv) > 1 else "key-"
users = sys.argv[2:] if len(sys.argv) > 2 else [f"key-{i}" for i in range(1, 11)]

for u in users:
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "marzban", "marzban-cli", "subscription", "get-link"],
        input=f"{u}\n",
        cwd="/opt/marzban",
        capture_output=True,
        text=True,
        timeout=120,
    )
    out = proc.stdout + proc.stderr
    m = re.search(r"https://\S+", out)
    sub = m.group(0) if m else "(failed)"
    print(f"{u}: {sub}")
