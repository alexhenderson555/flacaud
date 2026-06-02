import httpx
res = httpx.get("http://localhost:8000/api/stream/tidal/14400?quality=LOSSLESS", follow_redirects=True)
print(res.status_code)
print(res.headers)
print(res.text[:200])
