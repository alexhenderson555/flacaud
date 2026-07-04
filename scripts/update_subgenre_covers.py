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


async def _artist_picture_url(c, artist_id):
    """Resolve an artist's picture URL, or None if the artist has no picture."""
    artist_data = await asyncio.to_thread(c._get, f"/artists/{artist_id}", countryCode="US")
    pic_id = artist_data.get('picture')
    name = artist_data.get('name')
    if pic_id:
        return f"https://resources.tidal.com/images/{pic_id.replace('-', '/')}/320x320.jpg", name
    return None, name


async def resolve_subgenre_cover(tidal_p, artists):
    """
    Find a cover for a subgenre by walking its artist list.

    Tries each artist in turn (not just the first): searches a track by that
    artist, resolves the primary artist id, and takes the artist picture. If no
    artist in the list has a picture, falls back to the first track's album cover
    so every subgenre with at least one findable track gets an image.
    """
    album_fallback = None
    for artist_name in artists:
        try:
            tracks = await asyncio.to_thread(tidal_p.search, artist_name, 1)
        except Exception as e:
            print(f"    Error searching for {artist_name}: {e}")
            continue

        if not tracks:
            print(f"    Track for {artist_name} not found on Tidal.")
            await asyncio.sleep(0.4)
            continue

        track = tracks[0]
        if album_fallback is None and getattr(track, 'cover_url', None):
            album_fallback = track.cover_url

        artist_id = track.artist_ids[0] if track.artist_ids else None
        if artist_id:
            try:
                with tidal_p._client() as c:
                    pic_url, name = await _artist_picture_url(c, artist_id)
                if pic_url:
                    print(f"    Found picture for {name}: {pic_url}")
                    return pic_url
                print(f"    No picture for {name}, trying next artist...")
            except Exception as e:
                print(f"    Error fetching artist {artist_id}: {e}")
        else:
            print(f"    Track found but no artist IDs for {artist_name}")
        await asyncio.sleep(0.4)

    if album_fallback:
        print(f"    Using album cover fallback: {album_fallback}")
        return album_fallback
    return None


async def update_subgenres():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src', 'tidal_dl_ru', 'data', 'genres_db.json'))
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

            print(f"  Resolving cover for subgenre: {subgenre['name']} ({len(artists)} artists)")
            cover = await resolve_subgenre_cover(tidal_p, artists)
            if cover:
                subgenre['image'] = cover
                updated_count += 1
            else:
                print(f"    No cover found for {subgenre['name']} after trying all artists.")

    if updated_count > 0:
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(db, f, indent=2, ensure_ascii=False)
        print(f"Successfully updated {updated_count} subgenres.")
    else:
        print("No subgenres updated.")

if __name__ == '__main__':
    asyncio.run(update_subgenres())
