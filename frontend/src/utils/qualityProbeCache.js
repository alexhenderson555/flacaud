const PREFIX = 'tidal-quality-probe-';
// A track's max/available quality tiers don't change minute to minute. With a
// fixed (non-Automatic) quality, the resolver conservatively starts at HIGH
// until the per-track probe confirms a higher tier is actually available, then
// upgrades — a deliberate cushion against requesting a tier that isn't there.
// A short TTL meant that cushion kicked in on almost every play, not just the
// first ever probe of a track, because a revisit past 10 minutes re-triggered
// the network round trip. An hour covers a normal listening session.
const TTL_MS = 60 * 60 * 1000;

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
