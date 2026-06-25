#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dist = ROOT / "frontend" / "dist"
main = (dist / "assets" / "index-DqMBVLZD.js").read_text(encoding="utf-8")
m = re.search(r"m\.f=\[(.*?)\]\)", main[:20000])
deps = [x.strip().strip('"') for x in m.group(1).split(",")]
missing = [d for d in deps if not (dist / d).is_file()]
css = dist / "assets/index-C8IQtxPH.css"
html = (dist / "index.html").read_text(encoding="utf-8")
print(f"mapDeps: {len(deps)}, missing: {len(missing)}")
for d in missing[:10]:
    print(" ", d)
print("css", css.is_file(), css.stat().st_size if css.is_file() else 0)
print("html bundle", "DqMBVLZD" in html, "C8IQtxPH" in html)
print("files", sum(1 for _ in dist.rglob("*") if _.is_file()))
