import { serializeTrackForStorage } from './trackNormalize';

const STORAGE_KEY = 'tidal-recently-played';
const MAX_ITEMS = 48;

export function pushRecentlyPlayed(track) {
  const slim = serializeTrackForStorage(track);
  if (!slim?.provider_id) return;
  try {
    const list = readRecentlyPlayed();
    const id = String(slim.provider_id);
    const next = [slim, ...list.filter((t) => String(t.provider_id) !== id)].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function readRecentlyPlayed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearRecentlyPlayed() {
  localStorage.removeItem(STORAGE_KEY);
}
