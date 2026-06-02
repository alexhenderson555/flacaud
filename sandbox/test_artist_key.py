import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import urllib.request, json
req = urllib.request.Request('http://localhost:80/api/artist/8847')
res = urllib.request.urlopen(req)
data = json.loads(res.read())
print("Keys in response:", list(data.keys()))
if 'artist' in data:
    print("Artist keys:", list(data['artist'].keys()))
"""
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_api_get.py', 'w') as f:
    f.write(script)
sftp.close()
stdin, stdout, stderr = ssh.exec_command("python3 /tmp/test_api_get.py")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
ssh.close()
