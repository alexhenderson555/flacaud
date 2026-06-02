import { analyzeAudioBuffer } from './audioAnalysis';

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

const featureCache = new Map();
const inflight = new Map();

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
  if (!track?.bpm || !track?.key) return null;
  const camelotKey = /^\d+[AB]$/i.test(track.key)
    ? track.key.toUpperCase()
    : musicalToCamelot(track.key);
  return {
    bpm: Math.round(Number(track.bpm)),
    musicalKey: /^\d+[AB]$/i.test(track.key) ? track.key : track.key,
    camelotKey,
  };
}

export function getCachedTrackFeatures(track) {
  const id = track?.provider_id != null ? String(track.provider_id) : null;
  if (!id) return null;
  return featureCache.get(id) || null;
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
  if (cached) return cached;

  if (inflight.has(id)) return inflight.get(id);

  const stored = normalizeStoredFeatures(track);
  if (stored) {
    featureCache.set(id, stored);
    return stored;
  }

  const promise = (async () => {
    if (!streamUrl) {
      const fb = hashFallback(track);
      featureCache.set(id, fb);
      return fb;
    }

    try {
      const res = await fetch(streamUrl, { headers: { Range: 'bytes=0-5000000' } });
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
        };
        featureCache.set(id, entry);
        return entry;
      } finally {
        await audioCtx.close().catch(() => {});
      }
    } catch (e) {
      console.warn('Track feature analysis failed, using hash fallback', e);
      const fb = hashFallback(track);
      featureCache.set(id, fb);
      return fb;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}
