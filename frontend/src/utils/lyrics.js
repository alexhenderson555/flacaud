const lyricsCache = new Map();
const inflight = new Map();
const EMPTY_CACHE_MS = 60_000;
const emptyCacheUntil = new Map();

export function lyricsCacheKey(track) {
  if (!track) return '';
  if (track.provider_id) {
    return `${track.provider || 'tidal'}:${String(track.provider_id)}`;
  }
  if (track.isrc) return `isrc:${track.isrc}`;
  return `${track.title || ''}|${track.artists?.[0] || ''}`;
}

function buildLyricsUrl(track) {
  const params = new URLSearchParams();
  if (track.provider) params.set('provider', track.provider);
  if (track.provider_id) params.set('provider_id', String(track.provider_id));
  if (track.artists?.[0]) params.set('artist', track.artists[0]);
  if (track.title) params.set('title', track.title);
  if (track.album) params.set('album', track.album);
  const dur = track.duration_s ?? track.duration;
  if (dur) params.set('duration', String(Math.round(Number(dur))));
  if (track.isrc) params.set('isrc', track.isrc);
  if (track.version) params.set('version', track.version);
  if (!params.has('title')) {
    params.set('q', `${track.artists?.[0] || ''} ${track.title || ''}`.trim());
  }
  return `/api/lyrics?${params.toString()}`;
}

export function getCachedLyrics(track) {
  const key = lyricsCacheKey(track);
  if (!key) return null;
  const emptyUntil = emptyCacheUntil.get(key);
  if (emptyUntil && Date.now() < emptyUntil) {
    return [];
  }
  if (emptyUntil) emptyCacheUntil.delete(key);
  const hit = lyricsCache.get(key);
  return hit === undefined ? null : hit;
}

export async function fetchLyricsForTrack(track) {
  if (!track) return [];
  const key = lyricsCacheKey(track);
  const cached = getCachedLyrics(track);
  if (cached !== null) return cached;
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const promise = fetch(buildLyricsUrl(track), { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      return data.lyrics || [];
    })
    .catch(() => [])
    .finally(() => {
      clearTimeout(timeoutId);
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const lines = await promise;
  if (lines.length > 0) {
    lyricsCache.set(key, lines);
    emptyCacheUntil.delete(key);
  } else {
    emptyCacheUntil.set(key, Date.now() + EMPTY_CACHE_MS);
  }
  return lines;
}

/** Fire-and-forget lyrics prefetch when a track starts playing. */
export function prefetchLyrics(track) {
  if (!track) return;
  const key = lyricsCacheKey(track);
  if (lyricsCache.has(key) || inflight.has(key)) return;
  if (emptyCacheUntil.get(key) && Date.now() < emptyCacheUntil.get(key)) return;
  fetchLyricsForTrack(track).catch(() => {});
}

export function clearLyricsCache() {
  lyricsCache.clear();
  inflight.clear();
  emptyCacheUntil.clear();
}

/** Index of the lyric line active at `currentTime` (first line active during intro). */
export function getActiveLyricIndex(lyrics, currentTime, leadSeconds = 0) {
  if (!lyrics?.length) return -1;
  const t = Number(currentTime) + (Number(leadSeconds) || 0);
  if (t < lyrics[0].time) return 0;
  let idx = 0;
  for (let i = 0; i < lyrics.length; i++) {
    if (t >= lyrics[i].time) idx = i;
    else break;
  }
  return idx;
}

export const LYRICS_SYNC_LEAD_S = 0.5;
export function invalidateLyricsEmptyCache() {}

/** Drop in-flight prefetch when switching tracks (key from lyricsCacheKey). */
export function cancelInflightLyricsForKey(key) {
  if (!key) return;
  inflight.delete(key);
}
