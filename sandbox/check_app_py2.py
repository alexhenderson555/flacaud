with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\server\app.py", "r", encoding="utf-8") as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if "asyncio.to_thread(_dl)" in line:
        print("".join(lines[i-15:i+30]))
        break

