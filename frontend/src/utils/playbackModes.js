export const REPEAT_OFF = 'off';
export const REPEAT_ALL = 'all';
export const REPEAT_ONE = 'one';

const STORAGE_SHUFFLE = 'tidal-shuffle';
const STORAGE_REPEAT = 'tidal-repeat';

export function loadShuffleEnabled() {
  try {
    return localStorage.getItem(STORAGE_SHUFFLE) === '1';
  } catch {
    return false;
  }
}

export function loadRepeatMode() {
  try {
    const v = localStorage.getItem(STORAGE_REPEAT);
    if (v === REPEAT_ALL || v === REPEAT_ONE) return v;
    return REPEAT_OFF;
  } catch {
    return REPEAT_OFF;
  }
}

export function persistShuffle(enabled) {
  try {
    localStorage.setItem(STORAGE_SHUFFLE, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function persistRepeat(mode) {
  try {
    localStorage.setItem(STORAGE_REPEAT, mode);
  } catch {
    /* ignore */
  }
}

export function cycleRepeatMode(mode) {
  if (mode === REPEAT_OFF) return REPEAT_ALL;
  if (mode === REPEAT_ALL) return REPEAT_ONE;
  return REPEAT_OFF;
}

/** Fisher–Yates shuffle; returns a new array (does not mutate input). */
export function shuffleTrackList(tracks) {
  const arr = [...(tracks || [])];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickRandomIndex(length, excludeIdx) {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  if (length === 2) return excludeIdx === 0 ? 1 : 0;
  let next = excludeIdx;
  let guard = 0;
  while (next === excludeIdx && guard < 24) {
    next = Math.floor(Math.random() * length);
    guard += 1;
  }
  return next === excludeIdx ? (excludeIdx === 0 ? 1 : 0) : next;
}

/**
 * Next index in queue, or -1 when playback should stop.
 */
export function getNextTrackIndex(playlist, currentIdx, { shuffle = false, repeat = REPEAT_OFF } = {}) {
  const pl = playlist || [];
  if (!pl.length) return -1;
  const idx = currentIdx >= 0 && currentIdx < pl.length ? currentIdx : 0;

  if (repeat === REPEAT_ONE) return idx;

  if (pl.length === 1) {
    return repeat === REPEAT_ALL ? 0 : -1;
  }

  if (shuffle) {
    const picked = pickRandomIndex(pl.length, idx);
    if (picked === idx && repeat !== REPEAT_ALL && repeat !== REPEAT_ONE) return -1;
    return picked;
  }

  const nextIdx = idx + 1;
  if (nextIdx < pl.length) return nextIdx;
  if (repeat === REPEAT_ALL) return 0;
  return -1;
}

export function getPreviousTrackIndex(playlist, currentIdx, { shuffle = false } = {}) {
  const pl = playlist || [];
  if (!pl.length) return -1;
  const idx = currentIdx >= 0 && currentIdx < pl.length ? currentIdx : 0;

  if (pl.length === 1) return 0;

  if (shuffle) {
    return pickRandomIndex(pl.length, idx);
  }

  return (idx - 1 + pl.length) % pl.length;
}

export function hasQueueSuccessor(playlist, currentIdx, { shuffle = false, repeat = REPEAT_OFF } = {}) {
  const pl = playlist || [];
  if (!pl.length) return false;
  if (repeat === REPEAT_ONE || repeat === REPEAT_ALL) return true;
  if (shuffle) return pl.length > 1;
  const idx = currentIdx >= 0 && currentIdx < pl.length ? currentIdx : 0;
  return idx < pl.length - 1;
}
