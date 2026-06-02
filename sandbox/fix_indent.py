
with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\server\app.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_dl = False
for i, line in enumerate(lines):
    if "def _dl():" in line:
        new_lines.append(line)
        # Check if the next line is indented at the same level (which is wrong)
        # In this specific case, def _dl(): was indented 12 spaces.
        # The next line might be indented 12 spaces too. Let's fix it by indenting the body of _dl by 16 spaces.
        in_dl = True
        continue
        
    if in_dl:
        if line.strip() == "" or line.startswith("                ") or line.startswith("            res = await"):
            in_dl = False
            new_lines.append(line)
        elif line.startswith("            with p._client() as c:"):
            # indent by 4 more spaces until we hit res = await
            in_dl = True
            new_lines.append("    " + line)
        else:
            if in_dl:
                new_lines.append("    " + line)
            else:
                new_lines.append(line)
    else:
        new_lines.append(line)

with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\server\app.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

