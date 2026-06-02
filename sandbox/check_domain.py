import socket
import requests

def check_domain():
    try:
        ip = socket.gethostbyname('proshli.ru')
        print(f"proshli.ru resolves to {ip}")
    except Exception as e:
        print(f"DNS error: {e}")
        
    try:
        r = requests.get('http://proshli.ru/', timeout=5)
        print(f"HTTP status: {r.status_code}")
        print("Snippet:\n", r.text[:200])
    except Exception as e:
        print(f"HTTP error: {e}")

if __name__ == '__main__':
    check_domain()
