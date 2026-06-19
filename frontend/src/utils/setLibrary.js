const STORAGE_KEY = 'tidal-set-library';
const MAX_CACHED_TRACKS = 120;

export function normalizeSetUrl(url) {
  return String(url || '').trim();
}

export function setIdFromUrl(url) {
  const n = normalizeSetUrl(url);
  if (!n) return '';
  try {
    const enc = encodeURIComponent(n);
    let hash = 0;
    for (let i = 0; i < enc.length; i += 1) {
      hash = ((hash << 5) - hash) + enc.charCodeAt(i);
      hash |= 0;
    }
    return `set_${Math.abs(hash).toString(36)}`;
  } catch {
    return `set_${n.length}_${n.slice(-24).replace(/\W/g, '')}`;
  }
}

const ANALYZER_PROGRESS_LABEL_RE = /^(analysis complete|processing audio|loading audio|downloading|analyzing|partial result|waiting|queued)/i;

export function formatSetSlug(slug) {
  return decodeURIComponent(String(slug || ''))
    .replace(/[-_+.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(text) {
  const s = formatSetSlug(text);
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isAnalyzerProgressLabel(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) return true;
  return ANALYZER_PROGRESS_LABEL_RE.test(s);
}

/** Human title for library rows — never show analysis status or raw URL as the name. */
export function resolveSetDisplayTitle({ title, url } = {}) {
  const n = normalizeSetUrl(url);
  const stored = String(title || '').trim();
  if (stored && !isAnalyzerProgressLabel(stored)) return stored;
  return deriveSetTitle(n);
}

export function deriveSetTitle(url, fallback = '') {
  const n = normalizeSetUrl(url);
  if (fallback && !isAnalyzerProgressLabel(fallback)) return fallback;
  try {
    const u = new URL(n);
    const host = u.hostname.replace(/^www\./i, '');

    if (/soundcloud\.com|snd\.sc/i.test(host)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const artist = titleCaseWords(parts[0]);
        const track = titleCaseWords(parts[1]);
        return `${artist} — ${track}`;
      }
      if (parts.length === 1) return titleCaseWords(parts[0]);
      return 'SoundCloud set';
    }

    if (/youtube\.com|youtu\.be/i.test(host)) {
      const parts = u.pathname.split('/').filter(Boolean);
      const liveIdx = parts.indexOf('live');
      if (liveIdx >= 0 && parts[liveIdx + 1]) {
        return `YouTube live — ${parts[liveIdx + 1].slice(0, 11)}`;
      }
      return 'YouTube set';
    }

    return host || 'DJ set';
  } catch {
    return n.slice(0, 48) || 'DJ set';
  }
}

export function setSourceHost(url) {
  try {
    return new URL(normalizeSetUrl(url)).hostname.replace(/^www\./i, '');
  } catch {
    return 'source';
  }
}

export function readSetLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSetLibrary(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function isSetInLibrary(url) {
  const id = setIdFromUrl(url);
  if (!id) return false;
  return readSetLibrary().some((s) => s.id === id);
}

/**
 * @param {{ url: string, title?: string, trackCount?: number, setTracks?: unknown[] }} entry
 */
export function upsertSetLibraryEntry(entry) {
  const url = normalizeSetUrl(entry?.url);
  if (!url) return null;
  const id = setIdFromUrl(url);
  const now = Date.now();
  const list = readSetLibrary();
  const idx = list.findIndex((s) => s.id === id);
  const prev = idx >= 0 ? list[idx] : {};
  const tracks = Array.isArray(entry.setTracks)
    ? entry.setTracks.slice(0, MAX_CACHED_TRACKS)
    : prev.setTracks;

  const next = {
    id,
    url,
    title: resolveSetDisplayTitle({ title: entry.title || prev.title, url }),
    trackCount: entry.trackCount ?? prev.trackCount ?? (tracks?.length || 0),
    setTracks: tracks?.length ? tracks : prev.setTracks,
    savedAt: prev.savedAt || now,
    updatedAt: now,
    lastAnalyzedAt: entry.lastAnalyzedAt ?? prev.lastAnalyzedAt,
  };

  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  writeSetLibrary(list);
  return next;
}

export function removeSetFromLibrary(urlOrId) {
  const id = typeof urlOrId === 'string' && urlOrId.startsWith('set_')
    ? urlOrId
    : setIdFromUrl(urlOrId);
  writeSetLibrary(readSetLibrary().filter((s) => s.id !== id));
}

export function toggleSetInLibrary(entry) {
  const url = normalizeSetUrl(entry?.url);
  if (!url) return false;
  if (isSetInLibrary(url)) {
    removeSetFromLibrary(url);
    return false;
  }
  upsertSetLibraryEntry(entry);
  return true;
}

export function analyzerQueryForSet(url, { play = false, analyze = false } = {}) {
  const params = new URLSearchParams();
  params.set('url', normalizeSetUrl(url));
  if (play) params.set('play', '1');
  if (analyze) params.set('analyze', '1');
  return `/analyzer?${params.toString()}`;
}
