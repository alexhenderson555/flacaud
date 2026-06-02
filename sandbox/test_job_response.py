import paramiko
import sys
host = "151.243.177.88"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password="***REMOVED-OLD-VPS-ROOT-PASSWORD***")
script = """
import urllib.request
try:
    # Use one of the recent jobs from the log
    req = urllib.request.Request('http://localhost:80/api/jobs/5255bf4bc4c74f7a')
    res = urllib.request.urlopen(req)
    print(res.read().decode())
except Exception as e:
    print(e)
"""
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_job.py', 'w') as f:
    f.write(script)
sftp.close()
stdin, stdout, stderr = ssh.exec_command("python3 /tmp/test_job.py")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
ssh.close()
