import localforage from 'localforage';
import { getMediaToken } from './mediaToken';

localforage.config({
  name: 'FlacAudio',
  storeName: 'audio_cache',
  description: 'Cached audio files for offline playback',
});

const inflightCache = new Map();

export function cacheKeyFor(track, quality = 'HIGH') {
  return `${track.provider}_${track.provider_id}_${quality}`;
}

export const cacheAudioTrack = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const existing = await localforage.getItem(cacheKey);
    if (existing) return true;

    let resource = `/api/stream/${track.provider}/${track.provider_id}?quality=${quality}&mt=${await getMediaToken()}`;
    if (window.__TAURI__) {
      resource = 'http://localhost:8000' + resource;
    }

    const response = await fetch(resource);
    if (!response.ok) throw new Error('Network response was not ok');

    const blob = await response.blob();
    await localforage.setItem(cacheKey, blob);
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

export const getCachedAudioUrl = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const blob = await localforage.getItem(cacheKey);
    if (blob) {
      return URL.createObjectURL(blob);
    }
  } catch (error) {
    console.error('Failed to get cached audio track', error);
  }
  return null;
};

export const isTrackCached = async (track, quality = 'HIGH') => {
  const cacheKey = cacheKeyFor(track, quality);
  try {
    const blob = await localforage.getItem(cacheKey);
    return !!blob;
  } catch {
    return false;
  }
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
    return true;
  } catch {
    return false;
  }
};
