#!/usr/bin/env python3
"""Generate workbox sw.js for recovered dist (vite-plugin-pwa compatible)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist-recovered"
WORKBOX = DIST / "workbox-33a84d7e.js"
BUNDLE = "index-DqMBVLZD.js"


def collect_urls() -> list[dict]:
    entries: list[dict] = []
    entries.append({"url": "index.html", "revision": None})
    for path in sorted(DIST.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(DIST).as_posix()
        if rel in ("sw.js", "workbox-33a84d7e.js"):
            continue
        if rel.startswith("assets/") or rel in (
            "logo.png", "manifest.webmanifest", "manifest.json", "favicon.svg", "icons.svg",
            "og-landing.jpg", "og-landing.svg", "robots.txt", "sitemap.xml",
        ) or rel.startswith("brand/"):
            entries.append({"url": rel, "revision": None})
    return entries


def main() -> None:
    if not WORKBOX.is_file():
        raise SystemExit(f"missing {WORKBOX}")
    urls = collect_urls()
    manifest = json.dumps(urls, separators=(",", ":"))
    sw = f'''if(!self.define){{let s,e={{}};const l=(l,r)=>(l=new URL(l+".js",r).href,e[l]||new Promise(e=>{{if("document"in self){{const s=document.createElement("script");s.src=l,s.onload=e,document.head.appendChild(s)}}else s=l,importScripts(l),e()}}).then(()=>{{let s=e[l];if(!s)throw new Error(`Module ${{l}} didn't register its module`);return s}}));self.define=(r,i)=>{{const n=s||("document"in self?document.currentScript.src:"")||location.href;if(e[n])return;let u={{}};const t=s=>l(s,n),a={{module:{{uri:n}},exports:u,require:t}};e[n]=Promise.all(r.map(s=>a[s]||t(s))).then(s=>(i(...s),u))}}}}define(["./workbox-33a84d7e"],function(s){{"use strict";self.skipWaiting(),s.clientsClaim(),s.precacheAndRoute({manifest}),s.cleanupOutdatedCaches(),s.registerRoute(({{request:e}})=>e.mode==="navigate",new s.NetworkFirst({{cacheName:"pages",plugins:[new s.ExpirationPlugin({{maxEntries:50,maxAgeSeconds:86400}})]}}),"GET")}});
'''
    (DIST / "sw.js").write_text(sw, encoding="utf-8")
    print(f"wrote sw.js with {len(urls)} precache entries")


if __name__ == "__main__":
    main()
