import asyncio
import io
from tidal_dl_ru.core.recognize import recognize_audio

async def main():
    # Let's create a dummy webm or just a standard mp3 if we have one
    # Actually, we can just print the exact error happening in recognize_audio by passing bad bytes
    print("Testing with bad bytes...")
    try:
        res = await recognize_audio(b"fake webm bytes", "audio/webm")
        print("Result:", res)
    except Exception as e:
        print("Exception:", e)

asyncio.run(main())
