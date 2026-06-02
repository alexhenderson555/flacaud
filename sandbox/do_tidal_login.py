import paramiko
import time
import os

host = "151.243.177.88"
user = "root"
password = "***REMOVED-OLD-VPS-ROOT-PASSWORD***"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

channel = ssh.invoke_shell()
channel.send("docker exec tidal-dl-ru-api-1 tidal-dl-ru login\n")

print("Waiting for URL...")
time.sleep(5) 
out = channel.recv(8192).decode()

# find url starting with https://login.tidal.com
url = ""
for line in out.split("\n"):
    if "https://login.tidal.com" in line:
        url = line.strip()
        break

if not url:
    print("Could not find URL. Full output:", out)
else:
    print("\n" + "="*50)
    print("TIDAL LOGIN REQUIRED!")
    print("Please open this URL in your browser:")
    print(url)
    print("="*50 + "\n")
    print("Waiting for you to create 'login_response.txt' with the callback URL...")

    while True:
        if os.path.exists("login_response.txt"):
            with open("login_response.txt", "r") as f:
                callback_url = f.read().strip()
            if callback_url:
                print(f"Read callback URL: {callback_url}")
                channel.send(callback_url + "\n")
                time.sleep(2)
                final_out = channel.recv(4096).decode()
                print("Login output:", final_out)
                os.remove("login_response.txt")
                break
        time.sleep(2)

ssh.close()
