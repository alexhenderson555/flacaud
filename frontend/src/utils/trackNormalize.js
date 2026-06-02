/** Normalize API track objects for the global player. */
export function normalizeTrack(raw) {
  if (!raw) return null;
  const artists = Array.isArray(raw.artists)
    ? raw.artists
    : typeof raw.artists_json === 'string'
      ? JSON.parse(raw.artists_json || '[]')
      : [];
  return {
    ...raw,
    provider: raw.provider || 'tidal',
    provider_id: String(raw.provider_id),
    artists,
    duration_s: raw.duration_s ?? raw.duration ?? null,
    source_url: raw.source_url || (raw.provider === 'tidal' ? `https://tidal.com/track/${raw.provider_id}` : raw.source_url),
  };
}

export function tracksMatch(a, b) {
  if (!a || !b) return false;
  return String(a.provider_id) === String(b.provider_id);
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
    quality: track.quality || 'LOW',
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
