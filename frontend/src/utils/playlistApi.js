import { normalizeTrack, serializeTrackForStorage } from './trackNormalize';

/** Slim JSON-safe tracks for PUT /api/playlists/{id} (keeps artist_ids). */
export function tracksForPlaylistApi(tracks) {
  return (tracks || [])
    .map((t) => serializeTrackForStorage(normalizeTrack(t)))
    .filter(Boolean);
}
