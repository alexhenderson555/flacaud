import vocabSeed from '@shared/music_vocab.json';

/** Shared with server (`shared/music_vocab.json` + `search_typo.py`). */
export const MUSIC_VOCAB_SEED = vocabSeed;

const STORAGE_KEY = 'tidal_search_vocab';
const MAX_TERMS = 500;

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string' && t.length >= 2) : [];
  } catch {
    return [];
  }
}

export function getSearchVocabulary() {
  const seen = new Set();
  const out = [];
  for (const term of [...readStored(), ...MUSIC_VOCAB_SEED]) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term.trim());
  }
  return out;
}

/** Learn from successful searches (artist names + query). */
export function rememberSearchVocabulary(query, tracks = []) {
  if (!query?.trim()) return;
  const set = new Set(readStored());
  const add = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && t.length <= 80) set.add(t);
  };
  add(query.trim());
  for (const tr of tracks.slice(0, 12)) {
    if (Array.isArray(tr.artists)) tr.artists.forEach(add);
    if (tr.title) add(tr.title);
  }
  const list = [...set].slice(-MAX_TERMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}
