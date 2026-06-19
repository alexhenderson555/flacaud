/** Calendar year for subtitles (Search, Library, TrackRow). */
export function formatTrackYear(track) {
  if (!track) return null;
  if (track.year) return String(track.year);
  const rd = track.release_date;
  if (typeof rd === 'string' && rd.length >= 4) {
    const y = rd.split('-')[0];
    return /^\d{4}$/.test(y) ? y : null;
  }
  return null;
}

export function parseArtistIds(raw) {
  if (Array.isArray(raw?.artist_ids)) return raw.artist_ids.map(String);
  if (typeof raw?.artist_ids_json === 'string') {
    try {
      const parsed = JSON.parse(raw.artist_ids_json || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Normalize API track objects for the global player. */
/** Map a track stored inside playlist `tracks_json` (slim or full API shape). */
export function mapPlaylistTrack(tr) {
  if (!tr) return null;
  return normalizeTrack({
    ...tr,
    provider_id: String(tr.provider_id),
    source_url: tr.source_url || `https://tidal.com/track/${tr.provider_id}`,
  });
}

export function normalizeTrack(raw) {
  if (!raw) return null;
  const artists = Array.isArray(raw.artists)
    ? raw.artists
    : typeof raw.artists_json === 'string'
      ? JSON.parse(raw.artists_json || '[]')
      : [];
  const release_date = raw.release_date || null;
  let year = raw.year;
  if (year == null && release_date) {
    const m = String(release_date).match(/^(\d{4})/);
    if (m) year = parseInt(m[1], 10);
  } else if (year != null) {
    year = parseInt(String(year), 10);
  }
  if (typeof year === 'number' && Number.isNaN(year)) year = null;
  return {
    ...raw,
    provider: raw.provider || 'tidal',
    provider_id: String(raw.provider_id),
    artists,
    artist_ids: parseArtistIds(raw),
    album_id: raw.album_id ? String(raw.album_id) : null,
    duration_s: raw.duration_s ?? raw.duration ?? null,
    release_date,
    year: year ?? null,
    source_url: raw.source_url || (raw.provider === 'tidal' ? `https://tidal.com/track/${raw.provider_id}` : raw.source_url),
  };
}

/** Track radio / similar: always play the seed track first, then recommendations. */
export function buildRadioQueue(seedTrack, radioTracks) {
  const seed = normalizeTrack(seedTrack);
  if (!seed) return [];
  const seedId = seed.provider_id;
  const rest = (radioTracks || [])
    .map((tr) => normalizeTrack(tr))
    .filter((tr) => tr && tr.provider_id !== seedId);
  return [seed, ...rest];
}

/** Stable id for dedup across library, playlists, and liked state. */
export function trackIdentityKey(track) {
  if (!track?.provider_id) return '';
  return `${track.provider || 'tidal'}:${String(track.provider_id)}`;
}

export function tracksMatch(a, b) {
  if (!a || !b) return false;
  return trackIdentityKey(a) === trackIdentityKey(b);
}

export function isTrackLiked(likedTracks, track) {
  if (!likedTracks || !track) return false;
  const key = trackIdentityKey(track);
  return key ? likedTracks.has(key) : false;
}

/** Strip player state to a small JSON-safe object for localStorage. */
export function serializeTrackForStorage(track) {
  if (!track) return null;
  const artists = Array.isArray(track.artists)
    ? track.artists
    : typeof track.artists_json === 'string'
      ? JSON.parse(track.artists_json || '[]')
      : [];
  return {
    provider: track.provider || 'tidal',
    provider_id: String(track.provider_id),
    title: track.title || '',
    artists,
    artist_ids: track.artist_ids || [],
    cover_url: track.cover_url || null,
    duration_s: track.duration_s ?? track.duration ?? null,
    album: track.album || '',
    quality: track.quality || 'HIGH',
    release_date: track.release_date || null,
    source_url: track.source_url || null,
    bpm: track.bpm ?? null,
    key: track.key ?? null,
  };
}

export function normalizeArtists(track) {
  if (!track) return [];
  if (Array.isArray(track.artists)) return track.artists.map(String);
  if (typeof track.artists === 'string') return [track.artists];
  if (typeof track.artists_json === 'string') {
    try {
      const parsed = JSON.parse(track.artists_json || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
