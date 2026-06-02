import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    # install socat
    ssh.exec_command("apt-get update && apt-get install -y socat")
    
    # kill existing socat if any
    ssh.exec_command("killall socat")
    
    # run socat in background
    ssh.exec_command("nohup socat TCP-LISTEN:8000,fork,reuseaddr TCP:127.0.0.1:8000 > /dev/null 2>&1 &")
    
    ssh.close()

if __name__ == '__main__':
    run()
