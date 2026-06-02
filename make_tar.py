import tarfile
import os

def exclude_filter(tarinfo):
    if any(x in tarinfo.name for x in ['node_modules', '.venv', '__pycache__', '.git', 'src-tauri']):
        return None
    return tarinfo

with tarfile.open('app.tar.gz', 'w:gz') as tar:
    # Just include dist for frontend
    for item in ['src', 'frontend/dist', '.env', 'docker-compose.yml', 'Dockerfile', 'pyproject.toml', 'uv.lock']:
        if os.path.exists(item):
            tar.add(item, filter=exclude_filter)
print("Archive created!")
