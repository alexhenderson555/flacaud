#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for name in ["Account-mbDUfmE7.js", "frontend/dist-recovered/assets/Account-DjUc-PH6.js"]:
    p = ROOT / name
    if not p.is_file():
        continue
    s = p.read_text(encoding="utf-8")
    print(f"\n=== {name} ({len(s)} bytes) ===")
    for pat in [
        r"Playback Quality",
        r"Automatic",
        r"activationCode",
        r"ThemeList",
        r"DownloadHistory",
        r"account-page",
        r"Playback quality",
        r"offline cache",
        r"LIFETIME",
        r"profileAvatars",
    ]:
        print(f"  {pat}: {pat in s or pat.lower() in s.lower()}")
    # backtick strings
    strings = re.findall(r"`([^`\\]{3,100})`", s)
    interesting = [x for x in strings if any(k in x.lower() for k in (
        "playback", "quality", "account", "welcome", "login", "theme", "download", "visual", "language", "automatic"
    ))]
    for x in interesting[:40]:
        print(" ", repr(x))
