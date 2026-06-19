import { normalizeSetUrl } from './setLibrary';

const probeCache = new Map();

export function cachedSetAudioUrl(url) {
  const normalized = normalizeSetUrl(url);
  const params = new URLSearchParams({ url: normalized });
  return `/api/sets/cached-audio?${params.toString()}`;
}

/** HEAD probe — cached in-memory for the session to avoid repeated checks. */
export async function probeCachedSetAudio(url) {
  const normalized = normalizeSetUrl(url);
  if (!normalized) return false;
  if (probeCache.has(normalized)) return probeCache.get(normalized);

  try {
    const res = await fetch(cachedSetAudioUrl(normalized), {
      method: 'HEAD',
      credentials: 'include',
    });
    const hit = res.ok;
    probeCache.set(normalized, hit);
    return hit;
  } catch {
    probeCache.set(normalized, false);
    return false;
  }
}

export function invalidateCachedSetAudioProbe(url) {
  const normalized = normalizeSetUrl(url);
  if (normalized) probeCache.delete(normalized);
}
