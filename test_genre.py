import asyncio
from tidal_dl_ru.server.database import init_db
from tidal_dl_ru.server.recommendations import build_recommendations

async def main():
    tracks = await build_recommendations(limit=10, user=None, session=None, skip_cache=True, genre="Afro House")
    for t in tracks:
        print(f"{t.title} - {t.artist_names}")

if __name__ == "__main__":
    asyncio.run(main())
