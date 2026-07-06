import http.server
import os
import socketserver
import threading

from dotenv import load_dotenv

load_dotenv('.env.local')

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def serve():
    with socketserver.TCPServer(("127.0.0.1", 8080), QuietHandler) as httpd:
        httpd.serve_forever()

t = threading.Thread(target=serve, daemon=True)
t.start()

pw = os.environ.get('TIDAL_SSH_PASSWORD')
print("Starting reverse tunnel download...")
cmd = f"sshpass -p '{pw}' ssh -o StrictHostKeyChecking=no -R 8080:127.0.0.1:8080 root@46.17.102.157 'curl -o /opt/tidal-dl-ru/app.tar.gz http://127.0.0.1:8080/app.tar.gz'"

# Wait, sshpass is not on Windows!
