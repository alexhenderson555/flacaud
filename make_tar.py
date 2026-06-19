import os
import tarfile

BASE_INCLUDE = [
    "frontend/dist",
    "docker-compose.yml",
    "docker-compose.postgres.yml",
    "docker-compose.prod.yml",
    "docker-compose.observability.yml",
    "migrations",
    "scripts",
    "alembic.ini",
    "ops",
]

BUILD_INCLUDE = [
    "src",
    "Dockerfile.api",
    "Dockerfile.worker",
    "pyproject.toml",
    "uv.lock",
    "alembic.ini",
    "migrations",
    ".dockerignore",
]


def exclude_filter(tarinfo):
    if any(x in tarinfo.name for x in ["node_modules", ".venv", "__pycache__", ".git", "src-tauri"]):
        return None
    return tarinfo


def create_tar(*, include_build_context: bool = False, output: str = "app.tar.gz") -> None:
    include = list(BASE_INCLUDE)
    if include_build_context:
        include.extend(BUILD_INCLUDE)
    with tarfile.open(output, "w:gz") as tar:
        for item in include:
            if os.path.exists(item):
                tar.add(item, filter=exclude_filter)
    print("Archive created!")


if __name__ == "__main__":
    mode = os.environ.get("DEPLOY_MODE", "").strip().lower()
    include_build = mode == "tar" or os.environ.get("TAR_INCLUDE_BUILD", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    create_tar(include_build_context=include_build)
