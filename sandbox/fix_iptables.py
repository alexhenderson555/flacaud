import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    commands = [
        "iptables -t nat -D PREROUTING -p tcp -m tcp --dport 443 -j REDIRECT --to-ports 8443",
        "iptables -t nat -D PREROUTING -p udp -m udp --dport 443 -j REDIRECT --to-ports 8443",
        "iptables -t nat -D OUTPUT -o lo -p tcp -m tcp --dport 443 -j REDIRECT --to-ports 8443",
        "iptables -t nat -D OUTPUT -o lo -p udp -m udp --dport 443 -j REDIRECT --to-ports 8443",
        # Add them correctly only for eth0
        "iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-ports 8443",
        "iptables -t nat -A PREROUTING -i eth0 -p udp --dport 443 -j REDIRECT --to-ports 8443"
    ]
    
    for cmd in commands:
        ssh.exec_command(cmd)
        
    _, stdout, _ = ssh.exec_command("iptables -t nat -S")
    print("IPTABLES:\n", stdout.read().decode(errors='ignore'))

    ssh.close()

if __name__ == '__main__':
    run()
