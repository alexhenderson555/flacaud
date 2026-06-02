import socket
import requests

def check_port(ip, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    try:
        s.connect((ip, port))
        print(f"Port {port} is OPEN")
    except Exception as e:
        print(f"Port {port} is CLOSED ({e})")
    finally:
        s.close()

check_port('46.17.102.157', 8443)
check_port('46.17.102.157', 8000)

try:
    r = requests.get('http://46.17.102.157:8000/dashboard', timeout=3)
    print("Dashboard status:", r.status_code)
except Exception as e:
    print("Dashboard request failed:", e)
