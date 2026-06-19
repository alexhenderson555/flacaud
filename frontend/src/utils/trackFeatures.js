import { analyzeAudioBuffer } from './audioAnalysis';
import { apiGetJson, apiPatchJson } from './apiClient';
import {
  isDjAnalysisBlockedForTrack,
  shouldDeferBackgroundMedia,
} from './playbackPriority';

/** Camelot wheel — matches backend tidal_dl_ru.core.dj._CAMELOT */
const CAMELOT = {
  'C major': '8B', 'Db major': '3B', 'D major': '10B', 'Eb major': '5B',
  'E major': '12B', 'F major': '7B', 'F# major': '2B', 'G major': '9B',
  'Ab major': '4B', 'A major': '11B', 'Bb major': '6B', 'B major': '1B',
  'C minor': '5A', 'Db minor': '12A', 'D minor': '7A', 'Eb minor': '2A',
  'E minor': '9A', 'F minor': '4A', 'F# minor': '11A', 'G minor': '6A',
  'Ab minor': '1A', 'A minor': '8A', 'Bb minor': '3A', 'B minor': '10A',
};

const ENHARMONIC = { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb' };

const STORAGE_KEY = 'tidal-track-features';
/** ~30s AAC preview — enough for BPM/key without 5MB per track */
const ANALYZE_RANGE_BYTES = 1_200_000;
/** Server ffmpeg preview can run up to ~90s — default API timeout is too short */
const DJ_META_TIMEOUT_MS = 120_000;
const featureCache = new Map();
const inflight = new Map();

export function loadPersistedFeatures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([id, entry]) => {
      if (entry?.bpm && entry?.camelotKey) featureCache.set(String(id), entry);
    });
  } catch {
    /* ignore */
  }
}

export function persistFeatureEntry(trackId, entry) {
  const id = String(trackId);
  const normalized = {
    bpm: Math.round(Number(entry.bpm)) || 120,
    musicalKey: entry.musicalKey || 'Cm',
    camelotKey: entry.camelotKey || musicalToCamelot(entry.musicalKey),
    analyzed: entry.analyzed !== false,
  };
  featureCache.set(id, normalized);
  try {
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    store[id] = normalized;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Cached / persisted analysis only — no hash fallback (for library UI + filters). */
export function getLibraryTrackFeatures(track) {
  if (!track?.provider_id) return null;
  loadPersistedFeatures();
  const cached = getCachedTrackFeatures(track);
  if (cached?.bpm && cached?.camelotKey && cached.analyzed !== false) {
    return cached;
  }
  const stored = normalizeStoredFeatures(track);
  if (stored) return { ...stored, analyzed: true };
  return null;
}

/** Cache / DB only — no hash fallback (set analyzer insights). */
export function getAnalyzedFeaturesOnly(track) {
  return getLibraryTrackFeatures(track);
}

export function musicalToCamelot(musicalKey) {
  if (!musicalKey) return null;
  if (/^\d+[AB]$/i.test(musicalKey)) return musicalKey.toUpperCase();

  const lower = musicalKey.toLowerCase();
  const isMinor = lower.endsWith('m') || lower.endsWith('min');
  let note = musicalKey.replace(/min/i, '').replace(/m$/i, '');
  note = ENHARMONIC[note] || note;
  const label = `${note} ${isMinor ? 'minor' : 'major'}`;
  return CAMELOT[label] || musicalKey;
}

function hashFallback(track) {
  const hash = String(track.provider_id).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const bpms = [120, 124, 128, 130, 95, 140, 115, 100];
  const keys = ['Am', 'C#m', 'Dm', 'Em', 'Fm', 'Gm', 'Bbm', 'Cm'];
  const musicalKey = keys[hash % keys.length];
  return {
    bpm: bpms[hash % bpms.length],
    musicalKey,
    camelotKey: musicalToCamelot(musicalKey),
  };
}

function normalizeStoredFeatures(track) {
  const bpm = track?.bpm;
  const rawKey = track?.camelot_key || track?.key;
  if (!bpm || !rawKey) return null;
  const camelotKey = /^\d+[AB]$/i.test(rawKey)
    ? rawKey.toUpperCase()
    : musicalToCamelot(rawKey);
  return {
    bpm: Math.round(Number(bpm)),
    musicalKey: track?.musical_key || rawKey,
    camelotKey,
  };
}

/** Hydrate in-memory cache from a library API row (server-stored DJ meta). */
export function seedFeaturesFromLibraryRow(row) {
  if (!row?.provider_id || !row?.bpm || !row?.camelot_key) return;
  persistFeatureEntry(row.provider_id, {
    bpm: row.bpm,
    camelotKey: row.camelot_key,
    musicalKey: row.musical_key || row.camelot_key,
    analyzed: true,
  });
}

/** Persist analyzed BPM/key to the user's saved track on the server. */
export async function syncDjMetaToServer(trackDbId, entry) {
  if (!trackDbId || !entry?.bpm || !entry?.camelotKey) return false;
  try {
    await apiPatchJson(
      `/api/library/${trackDbId}/dj`,
      {
        bpm: Math.round(Number(entry.bpm)),
        camelot_key: entry.camelotKey,
        musical_key: entry.musicalKey || null,
      },
      { auth: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function getCachedTrackFeatures(track) {
  const id = track?.provider_id != null ? String(track.provider_id) : null;
  if (!id) return null;
  const row = featureCache.get(id);
  if (!row || row.analyzed === false) return null;
  return row;
}

/** Drop in-memory failed probes so analysis can retry (e.g. after enabling DJ in profile). */
export function clearFailedFeatureCache(providerId) {
  const id = providerId != null ? String(providerId) : '';
  if (!id) return;
  const row = featureCache.get(id);
  if (row?.analyzed === false) featureCache.delete(id);
}

export function clearFailedFeatureCacheForTracks(tracks) {
  (tracks || []).forEach((t) => clearFailedFeatureCache(t?.provider_id));
}

/** Synchronous lookup: cache → track tags → deterministic hash. */
export function getTrackFeaturesSync(track) {
  if (!track) return { bpm: 120, musicalKey: 'Cm', camelotKey: '8A' };
  const cached = getCachedTrackFeatures(track);
  if (cached) return cached;
  const stored = normalizeStoredFeatures(track);
  if (stored) return stored;
  return hashFallback(track);
}

/** Analyze once per track id and cache — shared by DJ panel and Auto-DJ. */
export async function analyzeTrackFeatures(track, streamUrl) {
  if (!track?.provider_id) return hashFallback(track || { provider_id: '0' });

  const id = String(track.provider_id);
  const cached = featureCache.get(id);
  if (cached?.analyzed === true) return cached;

  if (inflight.has(id)) return inflight.get(id);

  const stored = normalizeStoredFeatures(track);
  if (stored) {
    const tagged = { ...stored, analyzed: true };
    persistFeatureEntry(id, tagged);
    return tagged;
  }

  const promise = (async () => {
    try {
      const isTidal = (track?.provider || 'tidal') === 'tidal';
      if (
        isTidal
        && !shouldDeferBackgroundMedia()
        && !isDjAnalysisBlockedForTrack(id)
      ) {
        try {
          const meta = await apiGetJson(`/api/track/tidal/${id}/dj-meta`, {
            auth: true,
            timeoutMs: DJ_META_TIMEOUT_MS,
          });
          if (meta?.bpm && meta?.camelot_key) {
            const entry = {
              bpm: Math.round(Number(meta.bpm)),
              musicalKey: meta.musical_key || meta.camelot_key,
              camelotKey: String(meta.camelot_key).toUpperCase(),
              analyzed: true,
            };
            persistFeatureEntry(id, entry);
            return entry;
          }
        } catch {
          /* fall through to client preview */
        }
      }

      if (!streamUrl) {
        return { ...hashFallback(track), analyzed: false };
      }

      const res = await fetch(streamUrl, {
        headers: { Range: `bytes=0-${ANALYZE_RANGE_BYTES}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const { bpm, key } = await analyzeAudioBuffer(audioBuffer);
        const musicalKey = key || 'Cm';
        const entry = {
          bpm: bpm || 120,
          musicalKey,
          camelotKey: musicalToCamelot(musicalKey),
          analyzed: true,
        };
        persistFeatureEntry(id, entry);
        return entry;
      } finally {
        await audioCtx.close().catch(() => {});
      }
    } catch (e) {
      console.warn('Track feature analysis failed', e);
      return { ...hashFallback(track), analyzed: false };
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}
