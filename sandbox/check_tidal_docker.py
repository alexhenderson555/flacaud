import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    _, stdout, _ = ssh.exec_command("cd /opt/tidal-dl-ru && docker compose exec -T api python -c \"import httpx, asyncio; asyncio.run(httpx.AsyncClient().get('https://resources.tidal.com'))\"")
    print("PYTHON HTTPX:\n", stdout.read().decode(errors='ignore'))

    ssh.close()

if __name__ == '__main__':
    run()
