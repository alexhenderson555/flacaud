#!/usr/bin/env python3
"""Restore a historical frontend dist bundle from production server assets."""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

import paramiko
from scp import SCPClient

from repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password

DEFAULT_BUNDLE = "index-DqMBVLZD.js"
REMOTE_DIST = f"{DEPLOY_PATH}/frontend/dist"
ASSET_RE = re.compile(r"assets/[A-Za-z0-9_.-]+\.(?:js|css)")


def ssh_exec(ssh: paramiko.SSHClient, cmd: str) -> str:
    _, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(err.strip() or out.strip() or f"ssh failed: {cmd}")
    return out


def collect_asset_refs(ssh: paramiko.SSHClient, bundle: str) -> list[str]:
    remote = f"{REMOTE_DIST}/assets/{bundle}"
    body = ssh_exec(ssh, f"cat {remote}")
    refs = sorted(set(ASSET_RE.findall(body)))
    # rolldown/vite runtime imports from same folder
    extra = sorted(set(re.findall(r'["\']([A-Za-z0-9_.-]+\.js)["\']', body)))
    for name in extra:
        path = f"assets/{name}"
        if path not in refs and name.startswith(("rolldown", "vendor", "react", "motion", "icons")):
            refs.append(path)
    return refs


def download_assets(ssh: paramiko.SSHClient, refs: list[str], bundle: str, out_dir: Path) -> None:
    assets_dir = out_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    with SCPClient(ssh.get_transport()) as scp:
        scp.get(f"{REMOTE_DIST}/assets/{bundle}", str(assets_dir / bundle))
        for ref in refs:
            if ref == f"assets/{bundle}":
                continue
            remote = f"{REMOTE_DIST}/{ref}"
            local = out_dir / ref.replace("/", "\\") if False else out_dir / ref
            local.parent.mkdir(parents=True, exist_ok=True)
            try:
                scp.get(remote, str(local))
            except Exception as exc:
                print(f"  skip missing {ref}: {exc}")


def write_index_html(out_dir: Path, bundle: str) -> None:
  css = "index-OYOtzu1a.css"
  css_path = out_dir / "assets" / css
  if not css_path.is_file():
    # try discover any index-*.css in assets
    matches = list((out_dir / "assets").glob("index-*.css"))
    css = matches[0].name if matches else css
  html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FlacAudio</title>
    <script type="module" crossorigin src="/assets/{bundle}"></script>
    <link rel="stylesheet" crossorigin href="/assets/{css}">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
"""
  (out_dir / "index.html").write_text(html, encoding="utf-8")


def copy_static_files(out_dir: Path) -> None:
    local_dist = ROOT / "frontend" / "dist"
    for name in [
        "logo.png", "manifest.webmanifest", "manifest.json", "robots.txt", "sitemap.xml",
        "favicon.svg", "icons.svg", "og-landing.jpg", "og-landing.svg", "workbox-33a84d7e.js",
    ]:
        src = local_dist / name
        if src.is_file():
            shutil.copy2(src, out_dir / name)
    for sub in ("brand", "assets/sync", "public"):
        pass
    brand = local_dist / "brand"
    if brand.is_dir():
        shutil.copytree(brand, out_dir / "brand", dirs_exist_ok=True)
    sync = local_dist / "assets" / "sync"
    if sync.is_dir():
        shutil.copytree(sync, out_dir / "assets" / "sync", dirs_exist_ok=True)


def make_tar(dist_dir: Path, tar_path: Path) -> None:
    if tar_path.is_file():
        tar_path.unlink()
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(dist_dir, arcname="frontend/dist")


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore Jun-18 ~01:00 dist from server")
    parser.add_argument("--bundle", default=DEFAULT_BUNDLE)
    parser.add_argument("--out", default=str(ROOT / "frontend" / "dist-recovered"))
    parser.add_argument("--deploy", action="store_true", help="Replace frontend/dist and create app.tar.gz")
    args = parser.parse_args()

    bundle = args.bundle
    out_dir = Path(args.out)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    pw = _password("TIDAL_SSH_PASSWORD")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {TIDAL_HOST}...")
    ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)

    info = ssh_exec(ssh, f"ls -la {REMOTE_DIST}/assets/{bundle}")
    print(info.strip())

    refs = collect_asset_refs(ssh, bundle)
    print(f"Found {len(refs)} asset refs in bundle")
    download_assets(ssh, refs, bundle, out_dir)

    # download index css if referenced by siblings from same era
    with SCPClient(ssh.get_transport()) as scp:
        for css in ("index-OYOtzu1a.css", "index-C8IQtxPH.css"):
            try:
                scp.get(f"{REMOTE_DIST}/assets/{css}", str(out_dir / "assets" / css))
            except Exception:
                pass

    ssh.close()

    write_index_html(out_dir, bundle)
    copy_static_files(out_dir)

    # minimal sw — will be regenerated on next vite build; for rollback copy current or skip
    local_sw = ROOT / "frontend" / "dist" / "sw.js"
    if local_sw.is_file():
        shutil.copy2(local_sw, out_dir / "sw.js")

    main_js = out_dir / "assets" / bundle
    print(f"Recovered {main_js} ({main_js.stat().st_size} bytes)")
    print(f"Output: {out_dir}")

    if args.deploy:
        live = ROOT / "frontend" / "dist"
        backup = ROOT / "frontend" / "dist-backup"
        if live.exists() and not backup.exists():
            shutil.copytree(live, backup)
        if live.exists():
            shutil.rmtree(live)
        shutil.copytree(out_dir, live)
        make_tar(live, ROOT / "app.tar.gz")
        print("Updated frontend/dist and app.tar.gz — run: python scripts/deploy_tidal.py")


if __name__ == "__main__":
    main()
