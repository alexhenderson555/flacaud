import os
import tarfile

INCLUDE = [
    "src",
    "frontend/dist",
    ".env",
    "docker-compose.yml",
    "docker-compose.postgres.yml",
    "docker-compose.prod.yml",
    "Dockerfile.api",
    "Dockerfile.worker",
    "pyproject.toml",
    "uv.lock",
    "ops",
]


def exclude_filter(tarinfo):
    if any(x in tarinfo.name for x in ["node_modules", ".venv", "__pycache__", ".git", "src-tauri"]):
        return None
    return tarinfo


with tarfile.open("app.tar.gz", "w:gz") as tar:
    for item in INCLUDE:
        if os.path.exists(item):
            tar.add(item, filter=exclude_filter)
print("Archive created!")
