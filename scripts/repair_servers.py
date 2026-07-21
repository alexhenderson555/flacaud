#!/usr/bin/env python3
"""Align production: tidal-dl-ru on 46.x, Marzban VPN on 151.x.

Requires env (never commit passwords):
  TIDAL_SSH_PASSWORD   — root@46.17.102.157
  VPN_SSH_PASSWORD     — root@151.243.177.88

Optional:
  TIDAL_HOST=46.17.102.157
  VPN_HOST=151.243.177.88
  SKIP_TIDAL_DEPLOY=1
  VPN_FIX=1              # ONLY when explicitly fixing VPN — never during normal deploy
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(ROOT / "scripts"))
from _ops_env import tidal_host  # noqa: E402

TIDAL_HOST = tidal_host(required=False) or os.environ.get("TIDAL_HOST", "")
VPN_HOST = os.environ.get("VPN_HOST", "151.243.177.88")
TIDAL_USER = os.environ.get("TIDAL_SSH_USER", "root")
VPN_USER = os.environ.get("VPN_SSH_USER", "root")
DEPLOY_PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")


def compose_files() -> str:
    """Docker Compose file list for production deploy."""
    files = "-f docker-compose.yml -f docker-compose.prod.yml"
    use_pg = os.environ.get("TIDAL_USE_POSTGRES", "").strip().lower() in ("1", "true", "yes")
    use_pg = use_pg or (os.environ.get("DATABASE_URL", "").startswith("postgresql"))
    if use_pg:
        files += " -f docker-compose.postgres.yml"
    if os.environ.get("TIDAL_ENABLE_OBSERVABILITY", "").strip().lower() in ("1", "true", "yes"):
        files += " -f docker-compose.observability.yml"
    return f"docker compose {files}"

MAIL_ENV_KEYS = (
    "RESEND_API_KEY",
    "TIDALDLRU_EMAIL_FROM",
    "TIDALDLRU_SMTP_HOST",
    "TIDALDLRU_SMTP_PORT",
    "TIDALDLRU_SMTP_USER",
    "TIDALDLRU_SMTP_PASSWORD",
    "TIDALDLRU_SMTP_FROM",
    "TIDALDLRU_SMTP_TLS",
)

IMAGE_ENV_KEYS = (
    "FLACAUD_TAG",
    "FLACAUD_API_IMAGE",
    "FLACAUD_WORKER_IMAGE",
    "FLACAUD_BOT_IMAGE",
)

OPS_ENV_KEYS = (
    "TIDALDLRU_OPS_API_KEY",
)

TRANSFER_ENV_KEYS = (
    "SPOTIPY_CLIENT_ID",
    "SPOTIPY_CLIENT_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
)

OBSERVABILITY_ENV_KEYS = (
    "TIDAL_ENABLE_OBSERVABILITY",
    "GRAFANA_ADMIN_PASSWORD",
    "GRAFANA_ADMIN_USER",
    "GRAFANA_ROOT_URL",
    "TIDALDLRU_LOG_LEVEL",
)


def _remote_env_upserts(keys: tuple[str, ...] = MAIL_ENV_KEYS) -> str:
    """Build remote shell snippet to merge env vars from local deploy environment."""
    parts: list[str] = []
    for key in keys:
        val = (os.environ.get(key) or "").strip()
        if not val:
            continue
        safe = val.replace("\\", "\\\\").replace("|", "\\|").replace("'", "'\"'\"'")
        parts.append(
            f"(grep -q '^{key}=' .env 2>/dev/null && "
            f"sed -i 's|^{key}=.*|{key}={safe}|' .env || "
            f"echo '{key}={safe}' >> .env)"
        )
    if not parts:
        return ""
    return " && ".join(parts) + " && "


def _run_local(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True, shell=sys.platform == "win32")


def _git_short_sha() -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return None
    return out or None


def _default_tag() -> str:
    sha = _git_short_sha()
    if sha:
        return sha
    return datetime.now(timezone.utc).strftime("manual-%Y%m%d%H%M%S")


def _ensure_image_env() -> str:
    """Set image env defaults and return deploy tag."""
    namespace = os.environ.get("FLACAUD_IMAGE_NAMESPACE", "flacaud").strip().strip("/")
    os.environ.setdefault("FLACAUD_API_IMAGE", f"{namespace}/flacaud-api")
    os.environ.setdefault("FLACAUD_WORKER_IMAGE", f"{namespace}/flacaud-worker")
    os.environ.setdefault("FLACAUD_BOT_IMAGE", f"{namespace}/flacaud-bot")
    tag = os.environ.get("FLACAUD_TAG", "").strip() or _default_tag()
    os.environ["FLACAUD_TAG"] = tag
    return tag


def _dockerhub_login() -> None:
    user = os.environ.get("DOCKERHUB_USERNAME", "").strip()
    token = os.environ.get("DOCKERHUB_TOKEN", "").strip()
    if not user or not token:
        raise SystemExit("Missing DOCKERHUB_USERNAME/DOCKERHUB_TOKEN for registry deploy")
    print("+ docker login --username <hidden> --password-stdin")
    subprocess.run(
        ["docker", "login", "--username", user, "--password-stdin"],
        input=token.encode("utf-8"),
        cwd=ROOT,
        check=True,
    )


def _local_docker_ready() -> bool:
    try:
        subprocess.run(
            ["docker", "info"],
            cwd=ROOT,
            capture_output=True,
            check=True,
            timeout=15,
        )
        return True
    except Exception:
        return False


def _build_and_push_images() -> None:
    tag = _ensure_image_env()
    _dockerhub_login()
    matrix = [
        ("FLACAUD_API_IMAGE", "Dockerfile.api"),
        ("FLACAUD_WORKER_IMAGE", "Dockerfile.worker"),
        ("FLACAUD_BOT_IMAGE", "Dockerfile.api"),
    ]
    for env_name, dockerfile in matrix:
        image = os.environ[env_name]
        full_tag = f"{image}:{tag}"
        _run_local(["docker", "build", "-f", dockerfile, "-t", full_tag, "."], cwd=ROOT)
        _run_local(["docker", "push", full_tag], cwd=ROOT)


def _deploy_mode() -> str:
    mode = os.environ.get("DEPLOY_MODE", "").strip().lower()
    if mode in ("tar", "registry"):
        return mode
    user = os.environ.get("DOCKERHUB_USERNAME", "").strip()
    token = os.environ.get("DOCKERHUB_TOKEN", "").strip()
    if user and token:
        return "registry"
    print("DEPLOY_MODE not set and Docker Hub creds missing — using tar (remote build)")
    return "tar"


def _password(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"Missing env: {name}", file=sys.stderr)
        sys.exit(1)
    return val


def _ssh_run(host: str, user: str, password: str, command: str, *, timeout: int = 3600) -> int:
    import paramiko

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=30)
    try:
        print(f"\n=== {host} ===\n+ {command}\n")
        _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        if out:
            print(out[-8000:] if len(out) > 8000 else out)
        if err:
            print(err[-4000:] if len(err) > 4000 else err, file=sys.stderr)
        return exit_status
    finally:
        ssh.close()


def _scp_tar(host: str, user: str, password: str, local_tar: Path) -> None:
    import math
    import sys

    import paramiko
    from scp import SCPClient

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=30)
    try:
        chunk_size = 5 * 1024 * 1024
        total_size = local_tar.stat().st_size
        chunks_count = math.ceil(total_size / chunk_size)
        
        print(f"Splitting {total_size} bytes into {chunks_count} chunks to avoid SCP hang...")
        sys.stdout.flush()
        
        _, stdout, _ = ssh.exec_command(f"rm -f {DEPLOY_PATH}/app.tar.gz.part*")
        stdout.channel.recv_exit_status()
        
        with SCPClient(ssh.get_transport()) as scp:
            with open(local_tar, "rb") as f:
                for i in range(chunks_count):
                    data = f.read(chunk_size)
                    remote_part = f"{DEPLOY_PATH}/app.tar.gz.part{i:03d}"
                    local_part = ROOT / f"app.tar.gz.part{i:03d}"
                    with open(local_part, "wb") as lf:
                        lf.write(data)
                    
                    sys.stdout.write(f"Uploading part {i+1}/{chunks_count} ({len(data)} bytes)...\n")
                    sys.stdout.flush()
                    
                    scp.put(str(local_part), remote_part)
                    local_part.unlink()

        print("Joining chunks on server...")
        sys.stdout.flush()
        
        _, stdout, stderr = ssh.exec_command(f"cat {DEPLOY_PATH}/app.tar.gz.part* > {DEPLOY_PATH}/app.tar.gz && rm {DEPLOY_PATH}/app.tar.gz.part*")
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            raise RuntimeError(f"Joining chunks failed: {stderr.read().decode()}")
        print("\nUpload completely finished.")
        sys.stdout.flush()
    except Exception as e:
        print("\nException during chunked SCP upload:", e)
        raise
    finally:
        ssh.close()



def fix_vpn_server() -> None:
    if not os.environ.get("VPN_FIX"):
        print("VPN host untouched (set VPN_FIX=1 only for manual Marzban maintenance)")
        return
    pw = _password("VPN_SSH_PASSWORD")
    # Remove mistaken tidal stack from VPN host
    _ssh_run(
        VPN_HOST,
        VPN_USER,
        pw,
        f"test -d {DEPLOY_PATH} && (cd {DEPLOY_PATH} && docker compose down -v) || true; "
        "docker rm -f $(docker ps -aq --filter 'name=tidal-dl-ru') 2>/dev/null || true",
        timeout=600,
    )
    code = _ssh_run(
        VPN_HOST,
        VPN_USER,
        pw,
        "test -d /opt/marzban && cd /opt/marzban && docker compose restart marzban || docker compose up -d",
        timeout=600,
    )
    if code != 0:
        print(f"VPN marzban restart exit {code}", file=sys.stderr)


def _prepare_caddyfile() -> None:
    """Pick origin TLS config: LE for CF DNS-only, internal cert when CF proxy is on."""
    cf_proxy = os.environ.get("CLOUDFLARE_PROXY", "").strip().lower() in ("1", "true", "yes", "on")
    src = ROOT / "ops" / ("Caddyfile.cloudflare" if cf_proxy else "Caddyfile.le")
    dst = ROOT / "ops" / "Caddyfile"
    if not src.is_file():
        raise SystemExit(f"Missing {src}")
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    mode = "cloudflare (tls internal)" if cf_proxy else "letsencrypt (DNS only)"
    print(f"Caddyfile <- {src.name} ({mode})")


def _remote_registry_build_push_step(*, safe_user: str, safe_token: str) -> str:
    tag = os.environ["FLACAUD_TAG"]
    api_img = os.environ["FLACAUD_API_IMAGE"]
    worker_img = os.environ["FLACAUD_WORKER_IMAGE"]
    bot_img = os.environ["FLACAUD_BOT_IMAGE"]
    return (
        f"echo '{safe_token}' | docker login --username '{safe_user}' --password-stdin && "
        f"docker build -f Dockerfile.api -t {api_img}:{tag} . && "
        f"docker build -f Dockerfile.worker -t {worker_img}:{tag} . && "
        f"docker build -f Dockerfile.api -t {bot_img}:{tag} . && "
        f"docker push {api_img}:{tag} && "
        f"docker push {worker_img}:{tag} && "
        f"docker push {bot_img}:{tag} && "
        f"COMPOSE='{compose_files()}' && "
    )


def deploy_tidal_server() -> None:
    if os.environ.get("SKIP_TIDAL_DEPLOY"):
        print("SKIP_TIDAL_DEPLOY set — skipping tidal deploy")
        return
    _prepare_caddyfile()
    pw = _password("TIDAL_SSH_PASSWORD")
    mode = _deploy_mode()
    print(f"Deploy mode: {mode}")
    tag = _ensure_image_env()
    local_docker = _local_docker_ready()
    registry_remote_build = mode == "registry" and not local_docker

    if mode == "registry" and local_docker:
        _build_and_push_images()
    elif mode == "registry":
        print("Local Docker unavailable — will build and push images on the server")

    if not os.environ.get("DEPLOY_SKIP_BUILD"):
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "frontend", check=True, shell=sys.platform == "win32")

    tar_env = os.environ.copy()
    if mode == "tar" or registry_remote_build:
        tar_env["TAR_INCLUDE_BUILD"] = "1"
    subprocess.run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT, check=True, env=tar_env)
    tar = ROOT / "app.tar.gz"
    if not tar.is_file():
        raise SystemExit("app.tar.gz missing after make_tar.py")

    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, f"mkdir -p {DEPLOY_PATH}", timeout=60)
    _scp_tar(TIDAL_HOST, TIDAL_USER, pw, tar)

    domain = os.environ.get("DEPLOY_DOMAIN", "flacaud.ru")
    public_base = os.environ.get("TIDALDLRU_PUBLIC_API_BASE", f"https://{domain}")
    acme_email = os.environ.get("ACME_EMAIL", f"admin@{domain}")
    mail_env = _remote_env_upserts()
    transfer_env = _remote_env_upserts(TRANSFER_ENV_KEYS)
    ops_env = _remote_env_upserts(OPS_ENV_KEYS)
    observability_env = _remote_env_upserts(OBSERVABILITY_ENV_KEYS)
    image_env = _remote_env_upserts(IMAGE_ENV_KEYS) if mode == "registry" else ""

    if mode == "registry":
        dockerhub_user = os.environ.get("DOCKERHUB_USERNAME", "").strip()
        dockerhub_token = os.environ.get("DOCKERHUB_TOKEN", "").strip()
        if not dockerhub_user or not dockerhub_token:
            raise SystemExit("Missing DOCKERHUB_USERNAME/DOCKERHUB_TOKEN for registry deploy")
        safe_user = dockerhub_user.replace("\\", "\\\\").replace("|", "\\|").replace("'", "'\"'\"'")
        safe_token = dockerhub_token.replace("\\", "\\\\").replace("|", "\\|").replace("'", "'\"'\"'")
        if registry_remote_build:
            image_step = _remote_registry_build_push_step(safe_user=safe_user, safe_token=safe_token)
        else:
            image_step = (
                f"echo '{safe_token}' | docker login --username '{safe_user}' --password-stdin && "
                f"COMPOSE='{compose_files()}' && "
                "$COMPOSE pull api worker bot && "
            )
    else:
        image_step = (
            f"COMPOSE='{compose_files()}' && "
            "$COMPOSE build api worker bot && "
        )

    remote = (
        f"cd {DEPLOY_PATH} && tar -xzf app.tar.gz && "
        "touch .env && "
        f"{mail_env}"
        f"{transfer_env}"
        f"{ops_env}"
        f"{observability_env}"
        f"{image_env}"
        f"(grep -q '^TIDALDLRU_PUBLIC_API_BASE=' .env && "
        f"sed -i 's|^TIDALDLRU_PUBLIC_API_BASE=.*|TIDALDLRU_PUBLIC_API_BASE={public_base}|' .env || "
        f"echo 'TIDALDLRU_PUBLIC_API_BASE={public_base}' >> .env) && "
        f"(grep -q '^DOMAIN=' .env && sed -i 's|^DOMAIN=.*|DOMAIN={domain}|' .env || echo 'DOMAIN={domain}' >> .env) && "
        f"(grep -q '^ACME_EMAIL=' .env && sed -i 's|^ACME_EMAIL=.*|ACME_EMAIL={acme_email}|' .env || echo 'ACME_EMAIL={acme_email}' >> .env) && "
        "(grep -q '^API_PORT=' .env && sed -i 's|^API_PORT=.*|API_PORT=8001|' .env || echo 'API_PORT=8001' >> .env) && "
        f"{image_step}"
        "docker builder prune -f --reserved-space 3gb 2>/dev/null || docker builder prune -f 2>/dev/null || true; "
        "docker image prune -f 2>/dev/null || true; "
        "if [ -z \"$COMPOSE\" ]; then echo 'Deploy aborted due to earlier errors.'; exit 1; fi; "
        # Single `up` recreates every service whose image/config changed and starts
        # caddy fresh if it isn't running — do NOT follow with a separate `up -d caddy`
        # / `restart caddy`. That redundant second touch force-recreates an
        # already-healthy caddy container before Docker has released port 80/443 from
        # the first recreate, failing with "address already in use" and leaving no
        # proxy listening (this pattern caused a real flacaud.ru outage — see the
        # matching fix in .github/workflows/deploy.yml).
        "$COMPOSE up -d --remove-orphans && "
        "bash ops/prune-frontend-dist.sh frontend/dist 2>/dev/null || true"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=3600)
    if code != 0:
        raise SystemExit(f"Tidal deploy failed with exit {code}")


def smoke_tidal() -> None:
    import ssl
    import urllib.error
    import urllib.request

    domain = os.environ.get("DOMAIN", os.environ.get("DEPLOY_DOMAIN", "flacaud.ru")).strip() or "flacaud.ru"
    candidates = [
        f"https://{domain}/api/providers",
        f"http://{TIDAL_HOST}/api/providers",
    ]
    last_err: Exception | None = None
    for url in candidates:
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, headers={"User-Agent": "tidal-deploy-smoke/1.0"})
            with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
                print(f"Smoke {url} -> {resp.status}")
                return
        except Exception as e:
            last_err = e
            continue
    print(f"Smoke failed: {last_err}", file=sys.stderr)


def verify_password_reset_mail_ready() -> None:
    """Quick server-side check that password reset mail is configured in api container."""
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        "$COMPOSE exec -T api python -c \""
        "import os; "
        "k=os.environ.get('RESEND_API_KEY',''); "
        "f=os.environ.get('TIDALDLRU_EMAIL_FROM','') or os.environ.get('TIDALDLRU_SMTP_FROM',''); "
        "print('mail_ready=' + ('yes' if (k and f) else 'no')); "
        "print('resend_key_len=' + str(len(k))); "
        "print('email_from=' + (f if f else 'MISSING'))\" && "
        "$COMPOSE logs api --tail 120 2>/dev/null | grep -i 'password_reset_' | tail -n 10 || true"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=240)


def check_manifest_failures() -> None:
    """Print recent 'Manifest fetch failed' log lines from the api container."""
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        "$COMPOSE logs api --tail 2000 2>/dev/null | grep -i 'Manifest fetch failed' | tail -n 40 || true"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=120)


def check_pool_status() -> None:
    """Print active Tidal pool accounts, their quota/status/cooldown (read-only)."""
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        "$COMPOSE exec -T api python -c \""
        "from tidal_dl_ru.providers.tidal.pool import session, TidalAccount; "
        "s=session().__enter__(); "
        "rows=s.execute(__import__('sqlalchemy').select(TidalAccount)).scalars().all(); "
        "[print(r.id, r.status, 'quota=%d/%d' % (r.downloads_today, r.daily_quota), 'last_used=%s' % r.last_used_at) for r in rows]"
        "\""
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=120)


def main() -> None:
    fix_vpn_server()
    deploy_tidal_server()
    smoke_tidal()
    verify_password_reset_mail_ready()
    print("\nDone. Tidal:", TIDAL_HOST, "| VPN (Marzban):", VPN_HOST)


if __name__ == "__main__":
    main()
