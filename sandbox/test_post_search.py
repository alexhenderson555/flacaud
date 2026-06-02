import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import urllib.request, json
req = urllib.request.Request('http://localhost:80/api/search', method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps({"provider": "tidal", "query": "Daft Punk", "limit": 1}).encode())
res = urllib.request.urlopen(req)
data = json.loads(res.read())
tracks = data.get('tracks', [])
if tracks:
    artist_id = tracks[0]['artist_ids'][0]
    print(f"Artist ID: {artist_id}")
    try:
        req2 = urllib.request.Request(f'http://localhost:80/api/artist/{artist_id}')
        res2 = urllib.request.urlopen(req2)
        print(res2.getcode())
        print(res2.read().decode())
    except Exception as e:
        print(e)
        if hasattr(e, 'read'):
            print(e.read().decode())
"""
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_api_post.py', 'w') as f:
    f.write(script)
sftp.close()
stdin, stdout, stderr = ssh.exec_command("python3 /tmp/test_api_post.py")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
ssh.close()
