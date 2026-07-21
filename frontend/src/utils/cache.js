import localforage from 'localforage';
import { getMediaToken } from './mediaToken';

localforage.config({
  name: 'FlacAud',
  storeName: 'audio_cache',
  description: 'Cached audio files for offline playback',
});

const inflightCache = new Map();

export const OFFLINE_CACHE_UPDATED = 'flacaud-offline-cache-updated';

function notifyOfflineCacheUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_CACHE_UPDATED));
  }
}

export function cacheKeyFor(track, quality = 'HIGH') {
  const provider = track?.provider || 'tidal';
  return `${provider}_${track.provider_id}_${quality}`;
}

function metaKeyFor(cacheKey) {
  return `${cacheKey}__meta`;
}

function trackMeta(track, quality) {
  return {
    provider: track?.provider || 'tidal',
    provider_id: track?.provider_id,
    title: track?.title || '',
    artists: Array.isArray(track?.artists) ? track.artists : [],
    cover_url: track?.cover_url || null,
    quality,
    cachedAt: Date.now(),
  };
}

/** Parse total size from Content-Range: bytes 0-524287/9000000 */
export function parseContentRangeTotal(header) {
  if (!header) return null;
  const m = String(header).match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Rough minimum bytes for a full track file (below this = partial stream chunk). */
export function minExpectedAudioBytes(track, quality = 'HIGH') {
  const dur = Number(track?.duration_s ?? track?.duration ?? 0);
  if (!dur || dur <= 0) return 768 * 1024;
  const kbps = quality === 'LOSSLESS' || quality === 'HI_RES' || quality === 'HI_RES_LOSSLESS'
    ? 900
    : quality === 'HIGH' ? 320 : 96;
  return Math.max(192 * 1024, Math.floor((dur * kbps * 1000) / 8 * 0.75));
}

export function isBlobCompleteEnough(blob, track, quality = 'HIGH') {
  if (!blob || blob.size < 65536) return false;
  return blob.size >= minExpectedAudioBytes(track, quality);
}

/** True when fetch body is the full resource, not a 512k BTS preview chunk. */
export function isFetchCompleteResponse(response, blob) {
  if (!response?.ok || !blob) return false;
  if (response.status === 200) {
    const cl = parseInt(response.headers.get('content-length') || '', 10);
    if (cl > 0 && blob.size < cl * 0.9) return false;
    return blob.size >= 65536;
  }
  if (response.status === 206) {
    const total = parseContentRangeTotal(response.headers.get('content-range'));
    if (!total) return false;
    return blob.size >= total * 0.9;
  }
  return false;
}

export async function isCacheCompleteForDownload(track, quality = 'HIGH') {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const blob = await localforage.getItem(cacheKey);
    return isBlobCompleteEnough(blob, track, quality);
  } catch {
    return false;
  }
}

export const cacheAudioTrack = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const existing = await localforage.getItem(cacheKey);
    if (existing) return true;

    const mt = await getMediaToken();
    if (!mt) throw new Error('No media token');
    let resource = `/api/stream/${track.provider || 'tidal'}/${track.provider_id}?quality=${quality}&mt=${encodeURIComponent(mt)}`;
    if (window.__TAURI__) {
      resource = 'http://localhost:8000' + resource;
    }

    const response = await fetch(resource);
    if (!response.ok) throw new Error('Network response was not ok');

    const blob = await response.blob();
    if (!isFetchCompleteResponse(response, blob) || !isBlobCompleteEnough(blob, track, quality)) {
      return false;
    }
    await localforage.setItem(cacheKey, blob);
    await localforage.setItem(metaKeyFor(cacheKey), trackMeta(track, quality));
    notifyOfflineCacheUpdated();
    return true;
  } catch (error) {
    console.error('Failed to cache audio track', error);
    return false;
  }
};

/** Background cache while listening — deduped per track+quality. */
export async function prefetchAudioToCache(track, quality = 'HIGH') {
  if (!track?.provider_id) return false;
  const cacheKey = cacheKeyFor(track, quality);
  const existing = await localforage.getItem(cacheKey);
  if (existing) return true;
  if (inflightCache.has(cacheKey)) return inflightCache.get(cacheKey);

  const job = cacheAudioTrack(track, quality).finally(() => {
    inflightCache.delete(cacheKey);
  });
  inflightCache.set(cacheKey, job);
  return job;
}

// Bounded history of object URLs created from cached blobs. createObjectURL leaks
// until revoked; we keep the most recent few (main + preload + a little history) and
// revoke the rest so a long listening session doesn't accumulate URL references.
const recentObjectUrls = [];
const OBJECT_URL_CAP = 8;

function trackObjectUrl(url) {
  recentObjectUrls.push(url);
  while (recentObjectUrls.length > OBJECT_URL_CAP) {
    const stale = recentObjectUrls.shift();
    try { URL.revokeObjectURL(stale); } catch { /* already revoked */ }
  }
  return url;
}

export const getCachedAudioUrl = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const blob = await localforage.getItem(cacheKey);
    if (blob) {
      if (!isBlobCompleteEnough(blob, track, quality)) {
        await localforage.removeItem(cacheKey);
        return null;
      }
      return trackObjectUrl(URL.createObjectURL(blob));
    }
  } catch (error) {
    console.error('Failed to get cached audio track', error);
  }
  return null;
};

export const isTrackCached = async (track, quality = 'HIGH') => {
  return isCacheCompleteForDownload(track, quality);
};

export async function downloadCachedTrack(track, quality = 'HIGH') {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const blob = await localforage.getItem(cacheKey);
    if (!blob) return false;
    const artist = track.artists?.[0] || 'Unknown';
    const title = track.title || 'track';
    const ext = blob.type?.includes('flac') ? 'flac' : 'm4a';
    const filename = `${artist} - ${title}.${ext}`.replace(/[<>:"/\\|?*]+/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (error) {
    console.error('Failed to download cached track', error);
    return false;
  }
}

export const removeCachedAudioTrack = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    await localforage.removeItem(cacheKey);
    await localforage.removeItem(metaKeyFor(cacheKey));
    notifyOfflineCacheUpdated();
    return true;
  } catch {
    return false;
  }
};

/** List cached tracks (name/artist/quality/size) for the Account offline-cache browser. */
export async function listCachedTracks() {
  const keys = await localforage.keys();
  const rows = [];
  for (const key of keys) {
    if (!key.endsWith('__meta')) continue;
    const meta = await localforage.getItem(key);
    if (!meta) continue;
    const cacheKey = key.slice(0, -'__meta'.length);
    const blob = await localforage.getItem(cacheKey);
    if (!(blob instanceof Blob)) continue;
    rows.push({ ...meta, cacheKey, bytes: blob.size });
  }
  rows.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
  return rows;
}

/** Download a cached track by its cache key (from listCachedTracks) without needing the full track object. */
export async function downloadCachedTrackByKey(cacheKey, meta) {
  try {
    const blob = await localforage.getItem(cacheKey);
    if (!blob) return false;
    const artist = meta?.artists?.[0] || 'Unknown';
    const title = meta?.title || 'track';
    const ext = blob.type?.includes('flac') ? 'flac' : 'm4a';
    const filename = `${artist} - ${title}.${ext}`.replace(/[<>:"/\\|?*]+/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (error) {
    console.error('Failed to download cached track', error);
    return false;
  }
}

export async function removeCachedAudioByKey(cacheKey) {
  try {
    await localforage.removeItem(cacheKey);
    await localforage.removeItem(metaKeyFor(cacheKey));
    notifyOfflineCacheUpdated();
    return true;
  } catch {
    return false;
  }
}

/** Count/size of blobs in the offline audio cache (Account settings). */
export async function getOfflineCacheStats() {
  const keys = await localforage.keys();
  let bytes = 0;
  let count = 0;
  for (const key of keys) {
    const item = await localforage.getItem(key);
    if (item instanceof Blob) {
      bytes += item.size;
      count += 1;
    }
  }
  let quota = null;
  try {
    if (navigator.storage?.estimate) {
      quota = (await navigator.storage.estimate()).quota ?? null;
    }
  } catch {
    quota = null;
  }
  return { count, bytes, quota };
}

export async function clearOfflineCache() {
  await localforage.clear();
  inflightCache.clear();
  notifyOfflineCacheUpdated();
}
