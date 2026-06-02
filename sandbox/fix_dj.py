import os

with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\core\dj.py", "rb") as f:
    content = f.read()

# The mess starts at "i m p o r t"
mess_idx = content.find(b"i\x00m\x00p\x00o\x00r\x00t")
if mess_idx != -1:
    clean_content = content[:mess_idx].rstrip()
else:
    mess_idx2 = content.find(b"i m p o r t")
    if mess_idx2 != -1:
        clean_content = content[:mess_idx2].rstrip()
    else:
        clean_content = content

with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\core\dj.py", "wb") as f:
    f.write(clean_content)

with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\core\read_tags.py", "r", encoding="utf-8") as f:
    read_tags_code = f.read()

with open(r"C:\Users\Alex\Cursor\tidal-dl-ru\src\tidal_dl_ru\core\dj.py", "a", encoding="utf-8") as f:
    f.write("\n\n" + read_tags_code + "\n")
