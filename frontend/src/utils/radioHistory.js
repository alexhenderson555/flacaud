const PREFIX = 'tidal-radio-history-';
const MAX_PER_SEED = 80;

/** Previously-served track ids for this radio seed, so a repeat "start radio"
 *  on the same track can ask the backend to skip them instead of reshuffling
 *  the same small Tidal neighbourhood pool into an identical-feeling list. */
export function getRadioHistory(provider, seedTrackId) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${provider}:${seedTrackId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRadioHistory(provider, seedTrackId, trackIds) {
  if (!trackIds?.length) return;
  try {
    const key = `${PREFIX}${provider}:${seedTrackId}`;
    const existing = getRadioHistory(provider, seedTrackId);
    const merged = [...existing, ...trackIds.map(String)];
    const deduped = Array.from(new Set(merged));
    const trimmed = deduped.slice(-MAX_PER_SEED);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}
