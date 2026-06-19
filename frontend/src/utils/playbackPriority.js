/**
 * Playback priority without killing background DJ entirely.
 * - Other tracks: analyze in parallel while something plays.
 * - Current track + seek/buffer: pause DJ so stream range requests win.
 */

let loading = false;
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

/** True only when playback is actively waiting on the network (seek / buffer). */
export function shouldDeferBackgroundMedia() {
  return loading || Date.now() < seekQuietUntil;
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
  seekQuietUntil = 0;
  currentTrackId = null;
}
