import httpx

resp = httpx.get('https://lrclib.net/api/search?q=reezer+loneliness', timeout=10)
print(resp.json())
