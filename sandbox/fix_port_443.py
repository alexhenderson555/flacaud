import paramiko

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    ssh.exec_command("iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8443")
    ssh.exec_command("iptables -t nat -A PREROUTING -p udp --dport 443 -j REDIRECT --to-port 8443")
    ssh.exec_command("iptables -t nat -A OUTPUT -p tcp -o lo --dport 443 -j REDIRECT --to-port 8443")
    ssh.exec_command("iptables -t nat -A OUTPUT -p udp -o lo --dport 443 -j REDIRECT --to-port 8443")
    
    ssh.close()

if __name__ == '__main__':
    run()
