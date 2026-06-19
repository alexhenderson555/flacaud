#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dist = ROOT / "frontend" / "dist-recovered"
main = (dist / "assets" / "index-DqMBVLZD.js").read_text(encoding="utf-8")
m = re.search(r"m\.f=\[(.*?)\]\)", main[:12000])
deps = [x.strip().strip('"') for x in m.group(1).split(",")]
print(f"mapDeps: {len(deps)}")
missing = [d for d in deps if not (dist / d).is_file()]
print(f"missing: {len(missing)}")
for d in missing:
    print(" ", d)
if "Genreverse" in main:
    print("has Genreverse in main bundle")
for name in deps:
    if "Genreverse" in name or "Radio" in name:
        print(" dep:", name)
