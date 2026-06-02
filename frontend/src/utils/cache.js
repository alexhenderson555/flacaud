import localforage from 'localforage';
import { getMediaToken } from './mediaToken';

localforage.config({
  name: 'FlacAudio',
  storeName: 'audio_cache',
  description: 'Cached audio files for offline playback'
});

export const cacheAudioTrack = async (track, quality = 'HIGH') => {
  const cacheKey = `${track.provider}_${track.provider_id}_${quality}`;
  try {
    const existing = await localforage.getItem(cacheKey);
    if (existing) return true; // Already cached

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

export const getCachedAudioUrl = async (track, quality = 'HIGH') => {
  const cacheKey = `${track.provider}_${track.provider_id}_${quality}`;
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
  const cacheKey = `${track.provider}_${track.provider_id}_${quality}`;
  try {
    const blob = await localforage.getItem(cacheKey);
    return !!blob;
  } catch (error) {
    return false;
  }
};

export const removeCachedAudioTrack = async (track, quality = 'HIGH') => {
  const cacheKey = `${track.provider}_${track.provider_id}_${quality}`;
  try {
    await localforage.removeItem(cacheKey);
    return true;
  } catch (error) {
    return false;
  }
};
