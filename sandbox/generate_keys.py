import paramiko
import json
import re

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    print("Generating keys...")
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban xray x25519")
    output = stdout.read().decode()
    print(output)
    
    priv_match = re.search(r'Private key:\s+(\S+)', output)
    pub_match = re.search(r'Public key:\s+(\S+)', output)
    
    if priv_match and pub_match:
        priv_key = priv_match.group(1)
        pub_key = pub_match.group(1)
        print("Priv:", priv_key)
        print("Pub:", pub_key)
        
        sftp = ssh.open_sftp()
        sftp.get('/var/lib/marzban/xray_config.json', 'xray_config.json')
        with open('xray_config.json', 'r') as f:
            config = json.load(f)
            
        for inbound in config.get('inbounds', []):
            stream = inbound.get('streamSettings', {})
            reality = stream.get('realitySettings')
            if reality:
                reality['privateKey'] = priv_key
                
        with open('xray_config.json', 'w') as f:
            json.dump(config, f, indent=2)
        sftp.put('xray_config.json', '/var/lib/marzban/xray_config.json')
        sftp.close()
        
        ssh.exec_command("cd /opt/marzban && docker compose restart")
    
    ssh.close()

if __name__ == '__main__':
    run()
