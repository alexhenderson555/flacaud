#!/usr/bin/env python3
"""Patch Marzban subscription: skip XTLSFlows.NONE in share links (v2rayNG)."""
from pathlib import Path

path = Path("/code/app/subscription/v2ray.py")
text = path.read_text(encoding="utf-8")
old = "if flow and (tls in ('tls', 'reality') and net in ('tcp', 'raw', 'kcp') and type != 'http'):\n            payload['flow'] = flow"
new = (
    "if flow and str(flow) not in ('XTLSFlows.NONE', 'none', 'NONE') "
    "and (tls in ('tls', 'reality') and net in ('tcp', 'raw', 'kcp') and type != 'http'):\n"
    "            payload['flow'] = flow"
)
count = text.count(old)
if count == 0:
    raise SystemExit("pattern not found")
text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
print(f"patched {count} occurrence(s)")
