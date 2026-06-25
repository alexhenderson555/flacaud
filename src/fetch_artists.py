import json
import time

import httpx

SUBGENRES = [
    "Electronic", "Melodic House", "Deep House", "Techno", "Synthwave", "Trance", "Dubstep", "Drum and Bass", "Chillwave", "IDM", "House", "Hardstyle",
    "Rock", "Indie Rock", "Punk", "Alternative", "Classic Rock", "Grunge", "Psychedelic Rock", "Hard Rock", "Post-Punk",
    "Metal", "Heavy Metal", "Death Metal", "Black Metal", "Metalcore", "Doom Metal", "Nu Metal", "Thrash Metal", "Symphonic Metal",
    "Hip-Hop / Rap", "Trap", "Boom Bap", "Lo-Fi", "Drill", "Conscious Rap", "Cloud Rap", "Old School Hip-Hop", "Mumble Rap", "Grime",
    "Pop", "Synth-Pop", "Dream Pop", "Electropop", "Hyperpop", "Dance-Pop", "Indie Pop", "Teen Pop", "Art Pop",
    "R&B / Soul", "Neo-Soul", "Contemporary R&B", "Funk", "Motown", "Quiet Storm", "Alternative R&B", "Classic Soul",
    "Jazz & Blues", "Bebop", "Smooth Jazz", "Delta Blues", "Chicago Blues", "Jazz Fusion", "Cool Jazz", "Free Jazz", "Soul Jazz",
    "Latin", "Reggaeton", "Salsa", "Bossa Nova", "Bachata", "Latin Pop", "Cumbia", "Merengue",
    "Classical", "Symphony", "Baroque", "Romantic", "Chamber Music", "Contemporary Classical", "Opera", "Choral",
    "Country & Folk", "Modern Country", "Bluegrass", "Americana", "Indie Folk", "Acoustic", "Alt-Country", "Traditional Country",
    "Global & World", "Afrobeats", "Afro", "K-Pop", "J-Pop", "Reggae", "Dancehall", "Bollywood", "Celtic",
    "Chill & Focus", "Lo-Fi Beats", "Nature Sounds", "Meditation", "White Noise", "Cinematic", "Ambient", "Downtempo", "Binaural Beats"
]

TOKEN = "CzET4vdadNUFQ5JU"
HEADERS = {"x-tidal-token": TOKEN}

def search_playlists(genre):
    url = f"https://api.tidal.com/v1/search?query={genre}&types=PLAYLISTS&limit=5&countryCode=US"
    try:
        res = httpx.get(url, headers=HEADERS)
        data = res.json()
        if 'playlists' in data and 'items' in data['playlists']:
            return [p['uuid'] for p in data['playlists']['items']]
    except Exception as e:
        print(f"Error searching {genre}: {e}")
    return []

def get_playlist_artists(uuid):
    url = f"https://api.tidal.com/v1/playlists/{uuid}/tracks?limit=100&countryCode=US"
    artists = []
    try:
        res = httpx.get(url, headers=HEADERS)
        data = res.json()
        if 'items' in data:
            for item in data['items']:
                if 'item' in item and 'artist' in item['item'] and item['item']['artist']:
                    artists.append(item['item']['artist']['name'])
                elif 'artist' in item and item['artist']:
                    artists.append(item['artist']['name'])
    except Exception as e:
        print(f"Error getting playlist {uuid}: {e}")
    return artists

def main():
    result = {}
    for i, genre in enumerate(SUBGENRES):
        print(f"[{i+1}/{len(SUBGENRES)}] Fetching artists for {genre}...")
        artists_set = set()
        playlists = search_playlists(genre)
        for p_uuid in playlists:
            p_artists = get_playlist_artists(p_uuid)
            artists_set.update(p_artists)
            if len(artists_set) >= 200:
                break
            time.sleep(0.5)

        artists_list = list(artists_set)
        if len(artists_list) > 200:
            artists_list = artists_list[:200]
        result[genre] = artists_list
        print(f"   -> Found {len(artists_list)} artists")
        time.sleep(0.5)

    with open("genre_seeds.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("Done!")

if __name__ == "__main__":
    main()
