import json
import urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/search",
    data=json.dumps({"query": "moderat", "limit": 2}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=30) as r:
    body = r.read()
    print("search", r.status, "bytes", len(body))
    print(body[:400].decode())
