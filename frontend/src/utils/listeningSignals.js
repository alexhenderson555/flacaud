/** Client-side implicit-feedback signals (play/skip/completion) driving
 * recommendation reranking — no backend involved, everything lives in localStorage. */
import { trackIdentityKey } from './trackNormalize';

const STORAGE_KEY = 'tidal-listening-signals';
const MAX_TRACKS = 2000;
const MAX_ARTISTS = 500;
const SKIP_THRESHOLD_S = 5;
const DISLIKE_AFFINITY_THRESHOLD = -0.3;

function empty() {
  return { tracks: {}, artists: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { tracks: parsed.tracks || {}, artists: parsed.artists || {} }
      : empty();
  } catch {
    return empty();
  }
}

function save(data) {
  try {
    const trackEntries = Object.entries(data.tracks);
    if (trackEntries.length > MAX_TRACKS) {
      trackEntries.sort((a, b) => (b[1].lastPlayed || 0) - (a[1].lastPlayed || 0));
      data.tracks = Object.fromEntries(trackEntries.slice(0, MAX_TRACKS));
    }
    const artistEntries = Object.entries(data.artists);
    if (artistEntries.length > MAX_ARTISTS) {
      artistEntries.sort((a, b) => (b[1].affinity || 0) - (a[1].affinity || 0));
      data.artists = Object.fromEntries(artistEntries.slice(0, MAX_ARTISTS));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/** Pair up parallel artist_ids/artists arrays; falls back to a name-keyed pseudo-id
 * when a track has no provider artist id (keeps affinity usable either way). */
function trackArtistEntries(track) {
  const ids = Array.isArray(track?.artist_ids) ? track.artist_ids : [];
  const names = Array.isArray(track?.artists) ? track.artists : [];
  const count = Math.max(ids.length, names.length);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const name = (names[i] || names[0] || '').trim();
    const id = ids[i] ? String(ids[i]) : (name ? `name:${name.toLowerCase()}` : null);
    if (id) out.push({ id, name });
  }
  return out;
}

/** Record one listening session for a track once it stops being current
 * (natural end, skip, or the app closing mid-track) — `elapsedSeconds` is
 * how far playback actually got, read from the audio element before the
 * next track resets it. */
export function recordPlaybackSignal(track, elapsedSeconds) {
  const key = trackIdentityKey(track);
  if (!key) return;
  const durationSeconds = Number(track.duration_s ?? track.duration ?? 0);
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const completionRatio = durationSeconds > 0 ? Math.min(elapsed / durationSeconds, 1) : 0;
  const skipped = elapsed < SKIP_THRESHOLD_S || completionRatio < 0.05;

  const data = load();
  if (!data.tracks[key]) {
    data.tracks[key] = {
      playCount: 0, skipCount: 0, completionCount: 0, avgCompletionRatio: 0, lastPlayed: 0,
    };
  }
  const t = data.tracks[key];
  t.playCount += 1;
  t.lastPlayed = Date.now();
  t.avgCompletionRatio = t.avgCompletionRatio === 0
    ? completionRatio
    : t.avgCompletionRatio * 0.8 + completionRatio * 0.2;
  if (skipped) {
    t.skipCount += 1;
  } else if (completionRatio >= 0.9) {
    t.completionCount += 1;
  }

  const weight = skipped
    ? -0.5
    : completionRatio > 0.8 ? 1.0
      : completionRatio > 0.5 ? 0.5
        : completionRatio > 0.2 ? 0.2
          : -0.2;

  for (const { id, name } of trackArtistEntries(track)) {
    if (!data.artists[id]) {
      data.artists[id] = { name, affinity: 0, playCount: 0, skipCount: 0 };
    }
    const a = data.artists[id];
    a.affinity = a.affinity * 0.9 + weight;
    a.playCount += 1;
    if (skipped) a.skipCount += 1;
    if (name) a.name = name;
  }

  save(data);
}

export function getTrackSignal(track) {
  const key = trackIdentityKey(track);
  if (!key) return null;
  return load().tracks[key] || null;
}

/** Higher = more worth resurfacing; blends completion, replay rate, and skip rate. */
export function getTrackScore(track) {
  const signal = getTrackSignal(track);
  if (!signal || !signal.playCount) return 0;
  const skipRate = signal.skipCount / signal.playCount;
  const completionRate = signal.completionCount / signal.playCount;
  return (
    signal.avgCompletionRatio * 2 + completionRate * 3 - skipRate * 4
    + Math.log2(signal.playCount + 1) * 0.5
  );
}

export function getArtistAffinity(artistId) {
  if (!artistId) return 0;
  return load().artists[artistId]?.affinity || 0;
}

export function getTopArtistIds(limit = 30) {
  const { artists } = load();
  return Object.entries(artists)
    .filter(([, v]) => v.playCount >= 2)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, limit)
    .map(([id]) => id);
}

export function getDislikedArtistIds(limit = 30) {
  const { artists } = load();
  return Object.entries(artists)
    .filter(([, v]) => v.playCount >= 2 && v.affinity < DISLIKE_AFFINITY_THRESHOLD)
    .sort((a, b) => a[1].affinity - b[1].affinity)
    .slice(0, limit)
    .map(([id]) => id);
}

export function getFrequentlySkippedTrackKeys(limit = 100) {
  const { tracks } = load();
  return Object.entries(tracks)
    .filter(([, v]) => v.playCount >= 2 && v.skipCount / v.playCount > 0.5)
    .sort((a, b) => (b[1].skipCount / b[1].playCount) - (a[1].skipCount / a[1].playCount))
    .slice(0, limit)
    .map(([key]) => key);
}

export function getShortPlayTrackKeys(limit = 100) {
  const { tracks } = load();
  return Object.entries(tracks)
    .filter(([, v]) => v.playCount >= 2 && v.avgCompletionRatio < 0.3)
    .sort((a, b) => a[1].avgCompletionRatio - b[1].avgCompletionRatio)
    .slice(0, limit)
    .map(([key]) => key);
}

function isTrackByDislikedArtist(track, dislikedArtistIds) {
  if (!dislikedArtistIds.size) return false;
  return trackArtistEntries(track).some(({ id }) => dislikedArtistIds.has(id));
}

/** Drop tracks that past behavior says this user skips or abandons early. */
export function filterRecommendations(tracks) {
  const dislikedArtistIds = new Set(getDislikedArtistIds());
  const skippedKeys = new Set(getFrequentlySkippedTrackKeys());
  const shortPlayKeys = new Set(getShortPlayTrackKeys());
  return (tracks || []).filter((tr) => {
    const key = trackIdentityKey(tr);
    if (!key) return true;
    if (skippedKeys.has(key) || shortPlayKeys.has(key)) return false;
    if (isTrackByDislikedArtist(tr, dislikedArtistIds)) return false;
    return true;
  });
}

/** Score by known-artist affinity so higher-affinity artists surface first. */
export function scoreRecommendation(track) {
  const dislikedArtistIds = new Set(getDislikedArtistIds());
  if (isTrackByDislikedArtist(track, dislikedArtistIds)) return -5;
  let score = 0;
  for (const { id } of trackArtistEntries(track)) {
    const affinity = getArtistAffinity(id);
    if (affinity > 0) score += Math.min(affinity, 5);
  }
  return score;
}

export function rankRecommendations(tracks) {
  return (tracks || [])
    .map((tr) => ({ track: tr, score: scoreRecommendation(tr) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.track);
}

export function clearListeningSignals() {
  localStorage.removeItem(STORAGE_KEY);
}
