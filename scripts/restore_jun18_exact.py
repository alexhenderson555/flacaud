#!/usr/bin/env python3
"""Exact Jun-18 ~01:13 dist restore: index-DqMBVLZD.js + index-C8IQtxPH.css + all chunks."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)

import paramiko
from scp import SCPClient

from repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password

BUNDLE = "index-DqMBVLZD.js"
CSS = "index-C8IQtxPH.css"
REMOTE_DIST = f"{DEPLOY_PATH}/frontend/dist"
OUT = ROOT / "frontend" / "dist-jun18-exact"
ASSET_IMPORT = re.compile(r'(?:from|\./)["\'](\./)?([A-Za-z0-9_.-]+\.(?:js|css))["\']|assets/([A-Za-z0-9_.-]+\.(?:js|css))')


def ssh_exec(ssh, cmd: str) -> str:
    _, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read().decode("utf-8", errors="replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(stderr.read().decode("utf-8", errors="replace") or out)
    return out


def map_deps(main_text: str) -> list[str]:
    m = re.search(r"m\.f=\[(.*?)\]\)", main_text[:20000])
    if not m:
        return []
    return [x.strip().strip('"') for x in m.group(1).split(",")]


def refs_in_js(text: str) -> set[str]:
    found: set[str] = set()
    for a, b, c in ASSET_IMPORT.findall(text):
        name = c or b
        if name.endswith((".js", ".css")):
            found.add(f"assets/{name}")
    return found


def collect_closure(assets_dir: Path, seeds: list[str]) -> set[str]:
    pending = list(seeds)
    seen: set[str] = set()
    while pending:
        rel = pending.pop()
        if rel in seen:
            continue
        seen.add(rel)
        path = assets_dir / rel.replace("assets/", "")
        if not path.is_file() or not rel.endswith(".js"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for ref in refs_in_js(text):
            if ref not in seen:
                pending.append(ref)
    return seen


def download_file(scp, remote: str, local: Path) -> bool:
    try:
        local.parent.mkdir(parents=True, exist_ok=True)
        scp.get(remote, str(local))
        return True
    except Exception as exc:
        print(f"  missing {remote}: {exc}")
        return False


def write_index_html(out_dir: Path) -> None:
    snap = (ROOT / "scripts" / "_server_index_snapshot.txt").read_text(encoding="utf-8")
    html = snap.split("\n---\n")[0]
    html = re.sub(
        r'<script type="module" crossorigin src="/assets/index-[^"]+\.js"></script>',
        f'<script type="module" crossorigin src="/assets/{BUNDLE}"></script>',
        html,
    )
    html = re.sub(
        r'<link rel="stylesheet" crossorigin href="/assets/index-[^"]+\.css">',
        f'<link rel="stylesheet" crossorigin href="/assets/{CSS}">',
        html,
    )
    (out_dir / "index.html").write_text(html, encoding="utf-8")


def write_sw(out_dir: Path) -> None:
    entries = [{"url": "index.html", "revision": None}]
    for path in sorted(out_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(out_dir).as_posix()
        if rel in ("sw.js", "workbox-33a84d7e.js"):
            continue
        if rel.startswith("assets/") or rel in (
            "logo.png", "manifest.webmanifest", "manifest.json", "favicon.svg", "icons.svg",
            "og-landing.jpg", "og-landing.svg", "robots.txt", "sitemap.xml",
        ) or rel.startswith("brand/"):
            entries.append({"url": rel, "revision": None})
    manifest = json.dumps(entries, separators=(",", ":"))
    sw = f'''if(!self.define){{let s,e={{}};const l=(l,r)=>(l=new URL(l+".js",r).href,e[l]||new Promise(e=>{{if("document"in self){{const s=document.createElement("script");s.src=l,s.onload=e,document.head.appendChild(s)}}else s=l,importScripts(l),e()}}).then(()=>{{let s=e[l];if(!s)throw new Error(`Module ${{l}} didn't register its module`);return s}}));self.define=(r,i)=>{{const n=s||("document"in self?document.currentScript.src:"")||location.href;if(e[n])return;let u={{}};const t=s=>l(s,n),a={{module:{{uri:n}},exports:u,require:t}};e[n]=Promise.all(r.map(s=>a[s]||t(s))).then(s=>(i(...s),u))}}}}define(["./workbox-33a84d7e"],function(s){{"use strict";self.skipWaiting(),s.clientsClaim(),s.precacheAndRoute({manifest}),s.cleanupOutdatedCaches(),s.registerRoute(({{request:e}})=>e.mode==="navigate",new s.NetworkFirst({{cacheName:"pages",plugins:[new s.ExpirationPlugin({{maxEntries:50,maxAgeSeconds:86400}})]}}),"GET")}});
'''
    (out_dir / "sw.js").write_text(sw, encoding="utf-8")
    print(f"sw.js: {len(entries)} precache entries")


def download_static(scp, out_dir: Path) -> None:
    names = [
        "logo.png", "manifest.webmanifest", "manifest.json", "robots.txt", "sitemap.xml",
        "favicon.svg", "icons.svg", "og-landing.jpg", "og-landing.svg", "workbox-33a84d7e.js",
    ]
    for name in names:
        download_file(scp, f"{REMOTE_DIST}/{name}", out_dir / name)
    for sub in ("brand",):
        remote = f"{REMOTE_DIST}/{sub}"
        local = out_dir / sub
        try:
            if local.exists():
                shutil.rmtree(local)
            # scp recursive via get with -r not available; skip if exists locally
        except Exception:
            pass
    brand_src = ROOT / "frontend" / "dist" / "brand"
    if brand_src.is_dir():
        shutil.copytree(brand_src, out_dir / "brand", dirs_exist_ok=True)
    sync_src = ROOT / "frontend" / "dist" / "assets" / "sync"
    if sync_src.is_dir():
        shutil.copytree(sync_src, out_dir / "assets" / "sync", dirs_exist_ok=True)


def restore() -> Path:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    assets = OUT / "assets"
    assets.mkdir()

    pw = _password("TIDAL_SSH_PASSWORD")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {TIDAL_HOST}...")
    ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)

    main_remote = f"{REMOTE_DIST}/assets/{BUNDLE}"
    info = ssh_exec(ssh, f"ls -la {main_remote} {REMOTE_DIST}/assets/{CSS}")
    print(info.strip())

    with SCPClient(ssh.get_transport()) as scp:
        download_file(scp, main_remote, assets / BUNDLE)
        download_file(scp, f"{REMOTE_DIST}/assets/{CSS}", assets / CSS)
        main_text = (assets / BUNDLE).read_text(encoding="utf-8")
        seeds = sorted(set(map_deps(main_text)) | {f"assets/{BUNDLE}", f"assets/{CSS}"})
        print(f"mapDeps seeds: {len(seeds)}")
        for rel in seeds:
            download_file(scp, f"{REMOTE_DIST}/{rel}", OUT / rel)
        closure = collect_closure(assets, list(seeds))
        extra = sorted(closure - set(seeds))
        print(f"transitive extra: {len(extra)}")
        for rel in extra:
            download_file(scp, f"{REMOTE_DIST}/{rel}", OUT / rel)
        download_static(scp, OUT)
    ssh.close()

    write_index_html(OUT)
    write_sw(OUT)

    main_size = (assets / BUNDLE).stat().st_size
    css_size = (assets / CSS).stat().st_size
    file_count = sum(1 for _ in OUT.rglob("*") if _.is_file())
    print(f"Restored {file_count} files; bundle={main_size} css={css_size}")
    return OUT


def deploy(out_dir: Path) -> None:
    live = ROOT / "frontend" / "dist"
    backup = ROOT / "frontend" / "dist-before-jun18-exact"
    if live.exists() and not backup.exists():
        shutil.copytree(live, backup)
        print(f"Backup -> {backup}")
    if live.exists():
        shutil.rmtree(live)
    shutil.copytree(out_dir, live)
    print(f"Promoted -> {live}")

    env = os.environ.copy()
    env["DEPLOY_SKIP_BUILD"] = "1"
    subprocess.run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT, check=True, env=env)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "deploy_tidal.py")], cwd=ROOT, check=True, env=env)


def main() -> None:
    out = restore()
    deploy(out)
    import urllib.request
    html = urllib.request.urlopen("https://flacaud.ru/", timeout=20).read().decode()
    m = re.search(r"index-[A-Za-z0-9_-]+\.js", html)
    c = re.search(r"index-[A-Za-z0-9_-]+\.css", html)
    print(f"LIVE bundle: {m.group(0) if m else 'NONE'}")
    print(f"LIVE css: {c.group(0) if c else 'NONE'}")


if __name__ == "__main__":
    main()
