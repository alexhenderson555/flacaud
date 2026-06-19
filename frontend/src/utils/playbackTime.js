/**
 * Resolve live playback position for UI sync (lyrics, karaoke, etc.).
 * Prefers the active A/B audio slot over a stale audioRef.
 */
export function getPlaybackCurrentTime({ getMainAudioEl, audioRef, progress } = {}) {
  const el = getMainAudioEl?.() ?? audioRef?.current;
  const live = el?.currentTime;
  if (Number.isFinite(live) && live >= 0) return live;
  const p = Number(progress);
  return Number.isFinite(p) && p >= 0 ? p : 0;
}
