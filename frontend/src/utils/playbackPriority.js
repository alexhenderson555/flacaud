/**
 * Playback priority for background media (DJ analysis, offline prefetch).
 * Pause all background stream work while the main player is loading or playing.
 */

let loading = false;
let playing = false;
let seekQuietUntil = 0;
let currentTrackId = null;
const listeners = new Set();
function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function setPlaybackPriorityState(patch = {}) {
  if ('loading' in patch) loading = !!patch.loading;
  if ('playing' in patch) playing = !!patch.playing;
  if ('currentTrackId' in patch) {
    currentTrackId = patch.currentTrackId != null ? String(patch.currentTrackId) : null;
  }
  notify();
}

/** Call when the user scrubs or commits a seek — hold DJ work briefly. */
export function markSeekActivity(ms = 4000) {
  seekQuietUntil = Date.now() + ms;
  notify();
}

/** Defer background stream fetches (DJ analysis, offline prefetch) while playback is active. */
export function shouldDeferBackgroundMedia() {
  return loading || playing || Date.now() < seekQuietUntil;
}

export function isDjAnalysisBlockedForTrack(providerId) {
  if (!providerId || !currentTrackId) return false;
  return String(providerId) === currentTrackId;
}

export function subscribePlaybackPriority(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @internal vitest only */
export function resetPlaybackPriorityForTests() {
  loading = false;
  playing = false;
  seekQuietUntil = 0;
  currentTrackId = null;
}
