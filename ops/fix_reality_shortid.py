#!/usr/bin/env python3
"""Set non-empty REALITY shortId in xray template (Marzban may regenerate on restart)."""
import json
import secrets

path = "/var/lib/marzban/xray_config.json"
cfg = json.load(open(path))
sid = secrets.token_hex(4)
for ib in cfg.get("inbounds", []):
    rs = ib.get("streamSettings", {}).get("realitySettings")
    if rs is not None:
        rs["shortIds"] = [sid, ""]
        print("shortId", sid)
json.dump(cfg, open(path, "w"), indent=2)
print("written", path)
