// Client-side artist portrait fallback via Deezer (free, no key, CORS-open).
// The backend already resolves portraits (Wikimedia → Deezer → iTunes → Tidal),
// but those server-side lookups can fail from the host's network; the user's
// browser often reaches Deezer fine. Best-effort: returns a URL or null.
const cache = new Map();

export async function fetchDeezerArtistImage(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let url = null;
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?limit=1&q=${encodeURIComponent(key)}`,
      { mode: 'cors' },
    );
    if (res.ok) {
      const data = await res.json();
      const a = data?.data?.[0];
      const candidate = a?.picture_xl || a?.picture_big || a?.picture_medium || a?.picture || null;
      if (candidate && String(candidate).startsWith('http')) url = candidate;
    }
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}
