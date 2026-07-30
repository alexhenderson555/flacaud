import logging
import urllib.parse
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

def fetch_amz_track(title: str, artist: str, album: str, duration: int) -> Optional[str]:
    """
    Attempt to fetch a 16-bit FLAC from the alternative AMZ API.
    Used as a fallback when Tidal returns a DRM-protected stream for a LOSSLESS request.
    """
    try:
        url = "https://amz.gecked.wtf/api/track/"
        params = {
            "track": title,
            "artist": artist,
            "album": album,
            "duration": str(duration),
            "quality": "UHD"
        }
        query = urllib.parse.urlencode(params)
        full_url = f"{url}?{query}"
        
        with httpx.Client(timeout=5.0) as client:
            # Mask user-agent to bypass basic blocks
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            resp = client.get(full_url, headers=headers)
            
            if resp.status_code == 200:
                data = resp.json()
                # The screenshot showed it's an API, usually returns a 'url' field
                stream_url = data.get("url")
                if stream_url:
                    logger.info(f"AMZ fallback successful for: {artist} - {title}")
                    return stream_url
            
            logger.debug(f"AMZ fallback no match or failed: HTTP {resp.status_code}")
            return None

    except Exception as e:
        logger.warning(f"AMZ fallback exception: {e}")
        return None
