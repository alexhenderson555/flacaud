import { apiDelete, apiGetJson, apiPostJson } from './apiClient';
import { hasAuthSession } from './hasAuthSession';
import { sumTrackDurations } from './trackDuration';
import {
  normalizeSetUrl,
  readSetLibrary,
  resolveSetDisplayTitle,
  setIdFromUrl,
  writeSetLibrary as writeLocalSets,
} from './setLibrary';

export function dispatchSetsChanged() {
  window.dispatchEvent(new CustomEvent('tidal-sets-changed'));
}

export function mapSavedSetRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    let setTracks;
    try {
      setTracks = JSON.parse(row.tracks_json || '[]');
    } catch {
      setTracks = [];
    }
    const url = normalizeSetUrl(row.url);
    return {
      id: row.id != null ? `srv_${row.id}` : setIdFromUrl(url),
      serverId: row.id,
      url,
      title: resolveSetDisplayTitle({ title: row.title, url }),
      trackCount: row.track_count ?? setTracks.length,
      durationSeconds: row.duration_seconds ?? sumTrackDurations(setTracks),
      setTracks,
      shareToken: row.share_token || null,
      savedAt: row.saved_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function fetchSavedSets(lang = 'en') {
  return mapSavedSetRows(await apiGetJson('/api/sets', { auth: true, lang }));
}

function hasAuth() {
  return hasAuthSession();
}

export async function upsertSetOnServer(entry, lang = 'en') {
  const url = normalizeSetUrl(entry?.url);
  if (!url) return null;
  const tracks = Array.isArray(entry.setTracks) ? entry.setTracks : undefined;
  const body = {
    url,
    title: resolveSetDisplayTitle({ title: entry.title, url }),
    track_count: entry.trackCount ?? tracks?.length,
    duration_seconds: entry.durationSeconds
      ?? (tracks ? sumTrackDurations(tracks) : undefined),
    tracks,
  };
  const row = await apiPostJson('/api/sets', body, { auth: true, lang });
  return mapSavedSetRows([row])[0];
}

export async function deleteSetOnServer(serverId, lang = 'en') {
  await apiDelete(`/api/sets/${serverId}`, { auth: true, lang });
}

/** @returns {'ok'|'failed'|'empty'} */
export async function mergeGuestSetsOnLogin(lang = 'en') {
  if (!hasAuth()) return 'empty';
  const guest = readSetLibrary().filter((s) => s?.url);
  if (!guest.length) return 'empty';

  let server;
  try {
    server = await fetchSavedSets(lang);
  } catch {
    return 'failed';
  }
  const serverUrls = new Set(server.map((s) => normalizeSetUrl(s.url)));

  for (const g of guest.slice(0, 40)) {
    const url = normalizeSetUrl(g.url);
    if (!url || serverUrls.has(url)) continue;
    try {
      await upsertSetOnServer({
        url,
        title: g.title,
        trackCount: g.trackCount,
        setTracks: g.setTracks,
        durationSeconds: g.durationSeconds ?? sumTrackDurations(g.setTracks || []),
      }, lang);
      serverUrls.add(url);
    } catch {
      /* skip */
    }
  }
  return 'ok';
}

/** Sync local cache from server rows (keeps offline read). */
export function serverIdFromLocalRow(row) {
  if (row?.serverId != null) return row.serverId;
  const m = String(row?.id || '').match(/^srv_(\d+)$/);
  return m ? Number(m[1], 10) : null;
}

export function cacheServerSetsLocally(rows) {
  const mapped = rows.map((r) => ({
    id: r.serverId != null ? `srv_${r.serverId}` : setIdFromUrl(r.url),
    serverId: r.serverId,
    url: r.url,
    title: r.title,
    trackCount: r.trackCount,
    durationSeconds: r.durationSeconds,
    setTracks: r.setTracks,
    savedAt: r.savedAt ? new Date(r.savedAt).getTime() : Date.now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
  }));
  writeLocalSets(mapped);
}

export async function upsertSetLibraryEntryAsync(entry, lang = 'en') {
  const url = normalizeSetUrl(entry?.url);
  if (!url) return null;

  if (hasAuth()) {
    const row = await upsertSetOnServer(entry, lang);
    const list = await fetchSavedSets(lang).catch(() => [row]);
    cacheServerSetsLocally(list);
    dispatchSetsChanged();
    return row;
  }

  const { upsertSetLibraryEntry } = await import('./setLibrary');
  const local = upsertSetLibraryEntry(entry);
  dispatchSetsChanged();
  return local;
}

export function isSetInLibraryUrls(url, knownSets) {
  const n = normalizeSetUrl(url);
  if (!n) return false;
  const list = knownSets || readSetLibrary();
  return list.some((s) => normalizeSetUrl(s.url) === n);
}
