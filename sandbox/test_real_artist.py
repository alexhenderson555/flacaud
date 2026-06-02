import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import httpx
res = httpx.get('http://localhost:80/api/search?q=Daft+Punk')
data = res.json()
tracks = data.get('tracks', [])
if tracks:
    artist_id = tracks[0]['artist_ids'][0]
    print(f"Artist ID: {artist_id}")
    artist_res = httpx.get(f'http://localhost:80/api/artist/{artist_id}')
    print(artist_res.status_code)
    print(artist_res.json())
"""
stdin, stdout, stderr = ssh.exec_command(f"docker exec tidal-dl-ru-api-1 python -c \"{script}\"")
sys.stdout.buffer.write(stdout.read())
ssh.close()
