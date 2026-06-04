const PREFIX = 'tidal-quality-probe-';
const TTL_MS = 10 * 60 * 1000;

export function readQualityProbeCache(provider, trackId) {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${provider}:${trackId}`);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) {
      sessionStorage.removeItem(`${PREFIX}${provider}:${trackId}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeQualityProbeCache(provider, trackId, data) {
  try {
    sessionStorage.setItem(
      `${PREFIX}${provider}:${trackId}`,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    /* quota */
  }
}
