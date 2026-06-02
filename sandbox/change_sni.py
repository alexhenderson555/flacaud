import paramiko
import json

NEW_IP = '46.17.102.157'
NEW_PASS = '***REMOVED-VPS-ROOT-PASSWORD***'

def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_IP, username='root', password=NEW_PASS, timeout=10)
    
    sftp = ssh.open_sftp()
    sftp.get('/var/lib/marzban/xray_config.json', 'xray_config.json')
    
    with open('xray_config.json', 'r') as f:
        config = json.load(f)
    
    # Modify the SNI and dest in realitySettings
    for inbound in config.get('inbounds', []):
        stream = inbound.get('streamSettings', {})
        reality = stream.get('realitySettings')
        if reality:
            reality['dest'] = 'yahoo.com:443'
            reality['serverNames'] = ['yahoo.com', 'www.yahoo.com']
            
    with open('xray_config.json', 'w') as f:
        json.dump(config, f, indent=2)
        
    sftp.put('xray_config.json', '/var/lib/marzban/xray_config.json')
    sftp.close()
    
    print("Restarting Marzban...")
    ssh.exec_command("cd /opt/marzban && docker compose restart")
    
    # Fetch new keys with yahoo.com
    _, stdout, _ = ssh.exec_command("cd /opt/marzban && docker compose exec -T marzban bash -c 'for u in alex-test friend-1 friend-2 friend-3 friend-4 friend-5; do marzban-cli user get $u | grep -A 10 vless:// ; done'")
    output = stdout.read().decode('utf-8', errors='ignore')
    print("\nNEW LINKS:\n", output)
    
    ssh.close()

if __name__ == '__main__':
    run()
