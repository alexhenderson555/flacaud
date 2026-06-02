import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    script = """
import ssl
import socket
import json
host = 'resources.tidal.com'
port = 443
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
with socket.create_connection((host, port)) as sock:
    with ctx.wrap_socket(sock, server_hostname=host) as ssock:
        cert = ssock.getpeercert(True)
        cert_dict = ssl.DER_cert_to_PEM_cert(cert)
        print('CERT:', cert_dict)
"""
    _, stdout, stderr = ssh.exec_command(f"cd /opt/tidal-dl-ru && docker compose exec -T api python -c \"{script}\"")
    print("CERT INFO:\n", stdout.read().decode(errors='ignore'))
    print("ERR:\n", stderr.read().decode(errors='ignore'))

    ssh.close()

if __name__ == '__main__':
    run()
