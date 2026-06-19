import asyncio
import json
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from tidal_dl_ru.providers.tidal.client import TidalClient

def main():
    api = TidalClient()
    
    genres = [
      {'name': 'Electronic', 'subs': ['Melodic House', 'Deep House', 'Techno', 'Synthwave', 'Trance', 'Dubstep', 'Drum and Bass', 'Chillwave', 'IDM', 'House', 'Hardstyle']},
      {'name': 'Rock', 'subs': ['Indie Rock', 'Punk', 'Alternative', 'Classic Rock', 'Grunge', 'Psychedelic Rock', 'Hard Rock', 'Post-Punk']},
      {'name': 'Metal', 'subs': ['Heavy Metal', 'Death Metal', 'Black Metal', 'Metalcore', 'Doom Metal', 'Nu Metal', 'Thrash Metal', 'Symphonic Metal']},
      {'name': 'Hip-Hop / Rap', 'subs': ['Trap', 'Boom Bap', 'Lo-Fi', 'Drill', 'Conscious Rap', 'Cloud Rap', 'Old School Hip-Hop', 'Mumble Rap', 'Grime']},
      {'name': 'Pop', 'subs': ['Synth-Pop', 'Dream Pop', 'Electropop', 'Hyperpop', 'Dance-Pop', 'Indie Pop', 'Teen Pop', 'Art Pop']},
      {'name': 'R&B / Soul', 'subs': ['Neo-Soul', 'Contemporary R&B', 'Funk', 'Motown', 'Quiet Storm', 'Alternative R&B', 'Classic Soul']},
      {'name': 'Jazz & Blues', 'subs': ['Bebop', 'Smooth Jazz', 'Delta Blues', 'Chicago Blues', 'Jazz Fusion', 'Cool Jazz', 'Free Jazz', 'Soul Jazz']},
      {'name': 'Latin', 'subs': ['Reggaeton', 'Salsa', 'Bossa Nova', 'Bachata', 'Latin Pop', 'Cumbia', 'Merengue']},
      {'name': 'Classical', 'subs': ['Symphony', 'Baroque', 'Romantic', 'Chamber Music', 'Contemporary Classical', 'Opera', 'Choral']},
      {'name': 'Country & Folk', 'subs': ['Modern Country', 'Bluegrass', 'Americana', 'Indie Folk', 'Acoustic', 'Alt-Country', 'Traditional Country']},
      {'name': 'Global & World', 'subs': ['Afrobeats', 'Afro', 'K-Pop', 'J-Pop', 'Reggae', 'Dancehall', 'Bollywood', 'Celtic']},
      {'name': 'Chill & Focus', 'subs': ['Lo-Fi Beats', 'Nature Sounds', 'Meditation', 'White Noise', 'Cinematic', 'Ambient', 'Downtempo', 'Binaural Beats']}
    ]
    
    res = {}
    for g in genres:
        print(f"Genre: {g['name']}")
        subs_data = []
        for sub in g['subs']:
            try:
                artists = api.search_artists(sub, limit=5)
                if artists:
                    artist = artists[0]
                    pic = artist.picture
                    if pic:
                        url = f"https://resources.tidal.com/images/{pic.replace('-', '/')}/320x320.jpg"
                        subs_data.append({'name': sub, 'image': url})
                        print(f"  {sub}: {url}")
                        continue
            except Exception as e:
                print(f"  Error {sub}: {e}")
            subs_data.append({'name': sub, 'image': None})
            print(f"  {sub}: No image")
            
        res[g['name']] = subs_data

    with open("subgenres.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
