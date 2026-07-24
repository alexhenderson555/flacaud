import { apiDelete, apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson, apiPutJson } from './apiClient';
import { hasAuthSession } from './hasAuthSession';
import { mapPlaylistTrack, normalizeTrack, parseArtistIds, trackIdentityKey } from './trackNormalize';
import { seedFeaturesFromLibraryRow } from './trackFeatures';
import { tracksForPlaylistApi } from './playlistApi';
import { isTidalCoverUrl } from './coverUrl';

export function playlistIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Map `/api/library` JSON rows to player-ready tracks (incl. DJ feature seed). */
export function mapLibraryApiRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const mapped = normalizeTrack({
      ...row,
      provider: row.provider || 'tidal',
      provider_id: String(row.provider_id),
      artists: JSON.parse(row.artists_json || '[]'),
      artist_ids: parseArtistIds(row),
      album_id: row.album_id ? String(row.album_id) : null,
      release_date: row.release_date || null,
      duration_s: row.duration_s ?? row.duration ?? null,
      duration: row.duration ?? row.duration_s ?? null,
      source_url: row.source_url || `https://tidal.com/track/${row.provider_id}`,
      quality: row.quality || 'HIGH',
    });
    if (mapped) seedFeaturesFromLibraryRow(mapped);
    return mapped;
  }).filter(Boolean);
}

export function mapPlaylistRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((p) => ({
    ...p,
    tracks: JSON.parse(p.tracks_json || '[]').map(mapPlaylistTrack).filter(Boolean),
  }));
}

export function trackNeedsMetaEnrich(t) {
  if (!t?.provider_id) return false;
  const dur = t.duration_s ?? t.duration;
  const noDuration = dur == null || dur === 0;
  const noCover = !t.cover_url || !isTidalCoverUrl(t.cover_url);
  const noRelease = !t.release_date && !t.year;
  const noArtists = !t.artists?.length;
  const noArtistIds = !t.artist_ids?.length;
  return noDuration || noCover || noRelease || noArtists || noArtistIds;
}

/** Only fields required before starting stream — do not block play on missing year/cover. */
export function trackNeedsPlaybackEnrich(t) {
  if (!t?.provider_id) return true;
  const dur = t.duration_s ?? t.duration;
  return dur == null || dur === 0;
}

/** Merge batch `/api/tracks/meta` rows into playlist/search tracks. */
export function enrichTracksFromMeta(tracks, metaRows) {
  if (!Array.isArray(tracks) || !tracks.length) return tracks || [];
  const byId = new Map();
  for (const row of metaRows || []) {
    if (row?.provider_id) byId.set(String(row.provider_id), row);
  }
  return tracks.map((t) => {
    const meta = byId.get(String(t.provider_id));
    if (!meta) return t;
    const duration_s = t.duration_s ?? t.duration ?? meta.duration_s ?? meta.duration ?? null;
    return {
      ...t,
      duration_s,
      duration: t.duration ?? meta.duration ?? duration_s,
      cover_url: t.cover_url || meta.cover_url,
      album: t.album || meta.album,
      album_id: t.album_id || meta.album_id,
      artist_ids: t.artist_ids?.length ? t.artist_ids : meta.artist_ids,
      artists: t.artists?.length ? t.artists : meta.artists,
      release_date: t.release_date || meta.release_date,
      year: t.year ?? meta.year,
      source_url: t.source_url || meta.source_url,
      provider: t.provider || meta.provider || 'tidal',
      quality: t.quality || meta.quality,
    };
  });
}

/** Resolve slim transfer / playlist rows to full Tidal metadata before playback. */
export async function ensureTrackPlaybackReady(track, lang = 'en') {
  const normalized = normalizeTrack(track);
  if (!normalized?.provider_id) return null;
  if (!trackNeedsPlaybackEnrich(normalized)) return normalized;
  try {
    const meta = await fetchTracksMetaBatch(normalized.provider, [normalized.provider_id], lang, { timeoutMs: 3000 });
    const [merged] = enrichTracksFromMeta([normalized], meta);
    return normalizeTrack(merged) || normalized;
  } catch {
    return normalized;
  }
}

export async function fetchTracksMetaBatch(provider, ids, lang = 'en', options = {}) {
  const unique = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) return [];
  const data = await apiPostJson(
    '/api/tracks/meta',
    { provider: provider || 'tidal', ids: unique.slice(0, 40) },
    { lang, ...options },
  );
  return Array.isArray(data?.tracks) ? data.tracks : [];
}

const META_BATCH_SIZE = 40;
const META_BATCH_MAX_ROUNDS = 25;

async function persistLibraryCoverPatches(tracks, merged, lang = 'en') {
  if (!hasAuthSession() || !Array.isArray(tracks) || !Array.isArray(merged)) return;
  const byPid = new Map(merged.map((t) => [String(t.provider_id), t]));
  await Promise.all(tracks.map(async (row) => {
    if (!row?.id) return;
    const next = byPid.get(String(row.provider_id));
    if (!next?.cover_url || !isTidalCoverUrl(next.cover_url)) return;
    if (row.cover_url === next.cover_url && isTidalCoverUrl(row.cover_url)) return;
    try {
      await apiPatchJson(
        `/api/library/${row.id}/meta`,
        { cover_url: next.cover_url },
        { auth: true, lang },
      );
    } catch {
      /* skip row */
    }
  }));
}

/** Fill missing duration/cover via API when not present in the liked library. */
export async function enrichTracksFromApi(tracks, lang = 'en', { persistLibrary = true } = {}) {
  if (!Array.isArray(tracks) || !tracks.length) return tracks || [];
  let merged = tracks;
  const provider = tracks[0]?.provider || 'tidal';

  for (let round = 0; round < META_BATCH_MAX_ROUNDS; round += 1) {
    const missing = merged.filter(trackNeedsMetaEnrich);
    if (!missing.length) break;
    const ids = [...new Set(missing.map((t) => String(t.provider_id)))].slice(0, META_BATCH_SIZE);
    if (!ids.length) break;
    try {
      const meta = await fetchTracksMetaBatch(provider, ids, lang);
      const next = enrichTracksFromMeta(merged, meta);
      const changed = next.some((row, i) => row !== merged[i]);
      merged = next;
      if (persistLibrary && changed) {
        await persistLibraryCoverPatches(tracks, merged, lang);
      }
      if (!changed) break;
    } catch {
      break;
    }
  }

  return merged;
}

/** Fill missing duration/cover on playlist rows from the user's liked library. */
export function enrichTracksFromLibrary(tracks, library) {
  if (!Array.isArray(tracks) || !tracks.length) return tracks || [];
  const byId = new Map();
  for (const row of library || []) {
    if (row?.provider_id) byId.set(String(row.provider_id), row);
  }
  return tracks.map((t) => {
    const lib = byId.get(String(t.provider_id));
    if (!lib) return t;
    const duration_s = t.duration_s ?? t.duration ?? lib.duration_s ?? lib.duration ?? null;
    return {
      ...t,
      duration_s,
      duration: t.duration ?? lib.duration ?? duration_s,
      cover_url: t.cover_url || lib.cover_url,
      album: t.album || lib.album,
      album_id: t.album_id || lib.album_id,
      artist_ids: t.artist_ids?.length ? t.artist_ids : lib.artist_ids,
      artists: t.artists?.length ? t.artists : lib.artists,
      release_date: t.release_date || lib.release_date,
    };
  });
}

export async function fetchLibraryTracks(lang = 'en') {
  return mapLibraryApiRows(await apiGetJson('/api/library', { auth: true, lang }));
}

export async function fetchPlaylists(lang = 'en') {
  return mapPlaylistRows(await apiGetJson('/api/playlists', { auth: true, lang }));
}

export async function createPlaylistApi(name, lang = 'en') {
  return apiPostJson('/api/playlists', { name }, { auth: true, lang });
}

export async function updatePlaylistTracksApi(playlistId, tracks, lang = 'en') {
  return apiPutJson(
    `/api/playlists/${playlistId}`,
    { tracks: tracksForPlaylistApi(tracks) },
    { auth: true, lang },
  );
}

export async function deletePlaylistApi(playlistId, lang = 'en') {
  return apiDelete(`/api/playlists/${playlistId}`, { auth: true, lang });
}

export async function deleteLibraryTrackApi(trackDbId, lang = 'en') {
  return apiDelete(`/api/library/${trackDbId}`, { auth: true, lang });
}

export function readGuestLibrary() {
  try {
    const raw = localStorage.getItem('tidal-library');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Player-ready tracks from the last successful library sync (instant UI hydrate). */
export function readCachedLibraryTracks() {
  return (readGuestLibrary() || [])
    .map((row) => normalizeTrack(row))
    .filter(Boolean);
}

/** Playlists from the last successful sync (instant UI hydrate). */
export function readCachedPlaylists() {
  return (readGuestPlaylists() || []).map((p) => ({
    ...p,
    tracks: (p.tracks || []).map(mapPlaylistTrack).filter(Boolean),
  }));
}

export function writeGuestLibrary(rows) {
  try {
    localStorage.setItem('tidal-library', JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch {
    /* quota */
  }
}

export function readGuestPlaylists() {
  try {
    const raw = localStorage.getItem('tidal-playlists');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeGuestPlaylists(rows) {
  try {
    localStorage.setItem('tidal-playlists', JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch {
    /* quota */
  }
}

const GUEST_MERGE_FLAG = 'tidal-guest-merged';

/** @returns {'ok'|'failed'|'empty'} */
async function mergeGuestTracksToServer(lang) {
  const guest = readGuestLibrary().filter((t) => t?.provider_id);
  if (!guest.length) return 'empty';

  let server;
  try {
    server = await fetchLibraryTracks(lang);
  } catch {
    return 'failed';
  }

  const serverIds = new Set(server.map(trackIdentityKey));
  const toUpload = guest.filter((t) => !serverIds.has(trackIdentityKey(t)));
  if (!toUpload.length) return 'ok';

  for (const track of toUpload.slice(0, 80)) {
    try {
      await apiPostJson(
        '/api/library',
        {
          provider: track.provider || 'tidal',
          provider_id: String(track.provider_id),
          title: track.title || 'Unknown',
          artists_json: JSON.stringify(track.artists || []),
          cover_url: track.cover_url || '',
          duration: track.duration || track.duration_s || 0,
          album: track.album || '',
          quality: track.quality || 'HIGH',
          release_date: track.release_date || null,
        },
        { auth: true, lang },
      );
    } catch {
      /* skip single row */
    }
  }
  return 'ok';
}

/** @returns {'ok'|'failed'|'empty'} */
async function mergeGuestPlaylistsToServer(lang) {
  const guest = readGuestPlaylists().filter((p) => p?.name?.trim());
  if (!guest.length) return 'empty';

  let server;
  try {
    server = await fetchPlaylists(lang);
  } catch {
    return 'failed';
  }

  const byName = new Map(server.map((p) => [p.name.trim().toLowerCase(), p]));

  for (const gp of guest.slice(0, 30)) {
    const tracks = (gp.tracks || []).map(mapPlaylistTrack).filter(Boolean);
    if (!tracks.length) continue;

    const key = gp.name.trim().toLowerCase();
    let target = byName.get(key);

    try {
      if (!target) {
        target = await createPlaylistApi(gp.name.trim(), lang);
        target = { ...target, tracks: [] };
        byName.set(key, target);
      }

      const existingIds = new Set((target.tracks || []).map(trackIdentityKey));
      const combined = [...(target.tracks || [])];
      for (const tr of tracks) {
        const idKey = trackIdentityKey(tr);
        if (idKey && !existingIds.has(idKey)) {
          combined.push(tr);
          existingIds.add(idKey);
        }
      }
      if (combined.length > (target.tracks || []).length) {
        await updatePlaylistTracksApi(target.id, combined, lang);
        target.tracks = combined;
      }
    } catch {
      /* skip playlist */
    }
  }

  return 'ok';
}

/** After login, upload guest library + playlists from localStorage (once per account). */
export async function mergeGuestDataOnLogin(lang = 'en') {
  if (!hasAuthSession()) return { library: false, playlists: false, sets: false };
  if (localStorage.getItem(GUEST_MERGE_FLAG) === '1') return { library: false, playlists: false, sets: false };

  const guestLib = readGuestLibrary().filter((t) => t?.provider_id);
  const guestPl = readGuestPlaylists().filter((p) => p?.name?.trim());

  const libraryStatus = guestLib.length ? await mergeGuestTracksToServer(lang) : 'empty';
  const playlistsStatus = guestPl.length ? await mergeGuestPlaylistsToServer(lang) : 'empty';

  let setsStatus;
  try {
    const { mergeGuestSetsOnLogin } = await import('./setLibraryApi');
    setsStatus = await mergeGuestSetsOnLogin(lang);
  } catch {
    setsStatus = 'failed';
  }

  const mergeFailed = [libraryStatus, playlistsStatus, setsStatus].some((s) => s === 'failed');
  if (!mergeFailed) {
    localStorage.setItem(GUEST_MERGE_FLAG, '1');
  }

  return {
    library: libraryStatus === 'ok',
    playlists: playlistsStatus === 'ok',
    sets: setsStatus === 'ok',
  };
}

/** @deprecated Use mergeGuestDataOnLogin */
export async function mergeGuestLibraryToServer(lang = 'en') {
  const r = await mergeGuestDataOnLogin(lang);
  return r.library || r.playlists;
}

export function librarySortCompare(a, b, sortOrder) {
  if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
  const ta = a.added_at ? new Date(a.added_at).getTime() : 0;
  const tb = b.added_at ? new Date(b.added_at).getTime() : 0;
  if (sortOrder === 'oldest') return ta - tb;
  return tb - ta;
}

export async function fetchSavedAlbumsApi(lang = 'en') {
  if (!hasAuthSession()) return [];
  const res = await apiGetJson('/api/library/albums', { auth: true, lang });
  return res || [];
}

export async function addAlbumToLibraryApi(album, lang = 'en') {
  if (!hasAuthSession()) throw new Error('Must be logged in to save albums');
  const payload = {
    provider_id: String(album.id || album.provider_id),
    title: album.title,
    artists_json: JSON.stringify(album.artists || []),
    cover_url: album.cover || album.cover_url || null,
    release_date: album.releaseDate || album.release_date || null,
    track_count: album.numberOfTracks || album.track_count || album.tracks?.length || 0,
  };
  return await apiPostJson('/api/library/albums', payload, { auth: true, lang });
}

export async function removeAlbumFromLibraryApi(albumId, lang = 'en') {
  if (!hasAuthSession()) return;
  return await apiDeleteJson(`/api/library/albums/${albumId}`, { auth: true, lang });
}
