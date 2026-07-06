from tidal_dl_ru.core.lyrics import fetch_lyrics_lines

lines = fetch_lyrics_lines(title="Loneliness", artist="Reezer")
print(f"Got {len(lines) if lines else 0} lines")
if lines:
    print(lines[0])
else:
    print("No lines returned!")
