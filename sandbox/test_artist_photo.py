import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import httpx
res = httpx.get('http://localhost:80/api/artist/3581781') # Let's assume some ID or search
print(res.text)
"""
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_artist.py', 'w') as f:
    f.write("import httpx; print(httpx.get('http://localhost:80/api/artist/3602148').text)")
sftp.close()
stdin, stdout, stderr = ssh.exec_command("python3 /tmp/test_artist.py")
sys.stdout.buffer.write(stdout.read())
ssh.close()
