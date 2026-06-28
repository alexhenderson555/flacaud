import asyncio
import json
import os
import sys

# Configure stdout for utf-8 on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Add src to path so we can import tidal_dl_ru
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from dotenv import load_dotenv

load_dotenv()

from tidal_dl_ru.core.router import get_provider_by_name


async def update_subgenres():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src', 'tidal_dl_ru', 'server', 'genres_db.json'))
    with open(db_path, 'r', encoding='utf-8') as f:
        db = json.load(f)

    tidal_p = get_provider_by_name("tidal")
    if not tidal_p:
        print("Tidal provider not found!")
        return

    updated_count = 0

    for genre_name, genre_data in db.items():
        print(f"Processing {genre_name}...")
        for subgenre in genre_data.get('subgenres', []):
            artists = subgenre.get('artists', [])
            if not artists:
                continue

            # Only fetch covers for subgenres that don't have one yet (newly added
            # ones) — avoids re-querying all 192 every run.
            if subgenre.get('image'):
                continue

            top_artist = artists[0]
            print(f"  Searching for top artist: {top_artist} (subgenre: {subgenre['name']})")

            try:
                # Use track search to bypass 403 on artist search
                tracks = await asyncio.to_thread(tidal_p.search, top_artist, 1)

                if tracks and len(tracks) > 0:
                    track = tracks[0]
                    # Get the primary artist ID
                    artist_id = None
                    if track.artist_ids and len(track.artist_ids) > 0:
                        artist_id = track.artist_ids[0]

                    if artist_id:
                        with tidal_p._client() as c:
                            artist_data = await asyncio.to_thread(c._get, f"/artists/{artist_id}", countryCode="US")

                        pic_id = artist_data.get('picture')
                        if pic_id:
                            pic_url = f"https://resources.tidal.com/images/{pic_id.replace('-', '/')}/320x320.jpg"
                            subgenre['image'] = pic_url
                            updated_count += 1
                            print(f"    Found picture for {artist_data.get('name')}: {pic_url}")
                        else:
                            print(f"    No picture for {artist_data.get('name')}")
                    else:
                        print(f"    Track found but no artist IDs for {top_artist}")
                else:
                    print(f"    Track for {top_artist} not found on Tidal.")

                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"    Error searching for {top_artist}: {e}")

    if updated_count > 0:
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(db, f, indent=2, ensure_ascii=False)
        print(f"Successfully updated {updated_count} subgenres.")
    else:
        print("No subgenres updated.")

if __name__ == '__main__':
    asyncio.run(update_subgenres())
