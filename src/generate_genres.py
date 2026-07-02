import asyncio
import json
import os
import sys
import time

# Ensure imports work from src directory
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from tidal_dl_ru.core.router import get_provider_by_name

CATEGORIES = {
    "Electronic": [
        "Melodic House", "Deep House", "Techno", "Synthwave", "Trance", "Dubstep", "Drum and Bass",
        "Chillwave", "IDM", "House", "Hardstyle", "Electro House", "Tech House", "Progressive House", "Future Bass"
    ],
    "Rock": [
        "Indie Rock", "Punk Rock", "Alternative Rock", "Classic Rock", "Grunge", "Psychedelic Rock", "Hard Rock",
        "Post-Punk", "Pop Punk", "Math Rock", "Shoegaze", "Garage Rock", "Folk Rock", "Southern Rock", "Blues Rock"
    ],
    "Metal": [
        "Heavy Metal", "Death Metal", "Black Metal", "Metalcore", "Doom Metal", "Nu Metal", "Thrash Metal",
        "Symphonic Metal", "Power Metal", "Groove Metal", "Progressive Metal", "Sludge Metal", "Folk Metal", "Industrial Metal", "Gothic Metal"
    ],
    "Hip-Hop / Rap": [
        "Trap", "Boom Bap", "Lo-Fi Hip Hop", "Drill", "Conscious Rap", "Cloud Rap", "Old School Hip-Hop",
        "Mumble Rap", "Grime", "East Coast Hip Hop", "West Coast Hip Hop", "Southern Hip Hop", "Alternative Hip Hop", "UK Drill", "Jazz Rap"
    ],
    "Pop": [
        "Synth-Pop", "Dream Pop", "Electropop", "Hyperpop", "Dance-Pop", "Indie Pop", "Teen Pop",
        "Art Pop", "K-Pop", "J-Pop", "Latin Pop", "Chamber Pop", "Britpop", "Bubblegum Pop", "Sophisti-Pop"
    ],
    "R&B / Soul": [
        "Neo-Soul", "Contemporary R&B", "Funk", "Motown", "Quiet Storm", "Alternative R&B", "Classic Soul",
        "Northern Soul", "Blue-Eyed Soul", "Psychedelic Soul", "Southern Soul", "PBR&B", "Boogie", "New Jack Swing", "Smooth Soul"
    ],
    "Jazz & Blues": [
        "Bebop", "Smooth Jazz", "Delta Blues", "Chicago Blues", "Jazz Fusion", "Cool Jazz", "Free Jazz",
        "Soul Jazz", "Vocal Jazz", "Swing", "Hard Bop", "Gypsy Jazz", "Contemporary Jazz", "Texas Blues", "Jump Blues"
    ],
    "Latin": [
        "Reggaeton", "Salsa", "Bossa Nova", "Bachata", "Latin Pop", "Cumbia", "Merengue",
        "Samba", "Tango", "Ranchera", "Vallenato", "Latin Trap", "Urbano Latino", "Mambo", "Bolero"
    ],
    "Classical": [
        "Symphony", "Baroque", "Romantic", "Chamber Music", "Contemporary Classical", "Opera", "Choral",
        "Minimalism", "Renaissance", "Classical Piano", "Gregorian Chant", "Neoclassical", "Atonal", "Film Score", "Impressionism"
    ],
    "Country & Folk": [
        "Modern Country", "Bluegrass", "Americana", "Indie Folk", "Acoustic", "Alt-Country", "Traditional Country",
        "Outlaw Country", "Bro-Country", "Country Pop", "Folk Punk", "Contemporary Folk", "Anti-Folk", "Neofolk", "Celtic Folk"
    ],
    "Global & World": [
        "Afrobeats", "Afro", "Reggae", "Dancehall", "Bollywood", "Celtic", "Flamenco",
        "Ska", "Highlife", "Qawwali", "Gamelan", "Klezmer", "Fado", "Mbalax", "Soca"
    ],
    "Chill & Focus": [
        "Lo-Fi Beats", "Nature Sounds", "Meditation", "White Noise", "Cinematic", "Ambient", "Downtempo",
        "Binaural Beats", "ASMR", "Dark Ambient", "Drone", "New Age", "Space Music", "Chillout", "Trip Hop"
    ]
}

async def generate():
    p = get_provider_by_name("tidal")
    if not p:
        print("Tidal provider not found")
        return

    genres_db = {}

    genre_images = {
        "Electronic": "/genres/genre_electronic_1781783267241.png",
        "Rock": "/genres/genre_rock_1781783278795.png",
        "Metal": "/genres/genre_metal_1781783287069.png",
        "Hip-Hop / Rap": "/genres/genre_hiphop_1781783297333.png",
        "Pop": "/genres/genre_pop_1781783307721.png",
        "R&B / Soul": "/genres/genre_rnb_1781783316965.png",
        "Jazz & Blues": "/genres/genre_jazz_1781783337431.png",
        "Latin": "/genres/genre_latin_1781783348619.png",
        "Classical": "/genres/genre_classical_1781783360883.png",
        "Country & Folk": "/genres/genre_country_1781783371674.png",
        "Global & World": "/genres/genre_world_1781783382572.png",
        "Chill & Focus": "/genres/genre_chill_1781783392590.png"
    }

    genre_colors = {
        "Electronic": "linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)",
        "Rock": "linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)",
        "Metal": "linear-gradient(135deg, #2b5876 0%, #4e4376 100%)",
        "Hip-Hop / Rap": "linear-gradient(135deg, #F09819 0%, #EDDE5D 100%)",
        "Pop": "linear-gradient(135deg, #E55D87 0%, #5FC3E4 100%)",
        "R&B / Soul": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        "Jazz & Blues": "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)",
        "Latin": "linear-gradient(135deg, #f83600 0%, #f9d423 100%)",
        "Classical": "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
        "Country & Folk": "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
        "Global & World": "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
        "Chill & Focus": "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)"
    }

    total_subgenres = sum(len(subs) for subs in CATEGORIES.values())
    count = 0

    for category, subs in CATEGORIES.items():
        genres_db[category] = {
            "name": category,
            "image": genre_images.get(category),
            "color": genre_colors.get(category),
            "subgenres": []
        }

        for sub in subs:
            count += 1
            print(f"[{count}/{total_subgenres}] Fetching {sub} via Tidal...", flush=True)

            try:
                # We search 250 tracks to ensure we get as many unique artists as possible
                tracks = p.search(sub, 250)

                artists_set = set()
                sub_image = None
                for t in tracks:
                    if t.artists:
                        artists_set.add(t.artists[0]) # Get primary artist
                        if not sub_image and t.cover_url:
                            sub_image = t.cover_url # Grab first cover as genre image

                artists_list = list(artists_set)[:200]
                print(f"   -> Found {len(artists_list)} artists", flush=True)

                genres_db[category]["subgenres"].append({
                    "name": sub,
                    "image": sub_image,
                    "artists": artists_list
                })
            except Exception as e:
                print(f"Error fetching {sub}: {e}")

            time.sleep(0.5)

    with open("src/tidal_dl_ru/data/genres_db.json", "w", encoding="utf-8") as f:
        json.dump(genres_db, f, ensure_ascii=False, indent=2)
    print("Done! Generated src/tidal_dl_ru/data/genres_db.json")

if __name__ == "__main__":
    asyncio.run(generate())
