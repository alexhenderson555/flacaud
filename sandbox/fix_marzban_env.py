import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    # Fix .env file
    ssh.exec_command("sed -i '/UVICORN_HOST/d' /opt/marzban/.env")
    ssh.exec_command("echo 'UVICORN_HOST=\"0.0.0.0\"' >> /opt/marzban/.env")
    ssh.exec_command("cd /opt/marzban && docker compose restart")
    
    ssh.close()

if __name__ == '__main__':
    run()
