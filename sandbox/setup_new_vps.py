import paramiko
import time

IP = '46.17.102.157'
USER = 'root'
PASSWORD = '***REMOVED-VPS-ROOT-PASSWORD***'

def run_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {IP}...")
    ssh.connect(IP, username=USER, password=PASSWORD, timeout=10)
    print("Connected! Running initial setup...")

    commands = [
        "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
        "curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh",
        "apt-get install -y docker-compose-plugin git curl wget ufw zip unzip",
        "echo 'Setup complete'"
    ]

    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status() 
        print("OUT:", stdout.read().decode())
        print("ERR:", stderr.read().decode())
        if exit_status != 0:
            print(f"Command failed with {exit_status}")

    ssh.close()
    print("Done configuring new VPS.")

if __name__ == '__main__':
    run_ssh()
