import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import asyncio
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url

async def test():
    import httpx
    http = httpx.Client(timeout=30.0)
    acc, tokens = tidal_pool.acquire(http)
    client = TidalClient(http=http, tokens=tokens)
    
    # Search for Adam port
    res = client.search("Adam Port", limit=5)
    artists = res.get("artists", {}).get("items", [])
    for a in artists:
        if a.get("name") == "Adam Port":
            print("Found artist id:", a["id"])
            print("Raw picture UUID:", a.get("picture"))
            print("Cover URL size 640:", cover_url(a.get("picture"), size=640) if a.get("picture") else "None")
            print("Cover URL size 750:", cover_url(a.get("picture"), size=750) if a.get("picture") else "None")
            break

asyncio.run(test())
"""
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_adam.py', 'w') as f:
    f.write(script)
sftp.close()
stdin, stdout, stderr = ssh.exec_command("docker exec -i tidal-dl-ru-api-1 python3 - < /tmp/test_adam.py")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
ssh.close()
