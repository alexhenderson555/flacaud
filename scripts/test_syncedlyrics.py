import syncedlyrics

lrc = syncedlyrics.search("Reezer Loneliness")
print(f"Lyrics found: {lrc is not None}")
if lrc:
    print(lrc[:100])
