import { writeGuestLibrary, writeGuestPlaylists } from './libraryApi';
import { normalizeTrack, trackIdentityKey, tracksMatch } from './trackNormalize';

/** Build liked-track id map from cached or live library rows. */
export function likedMapFromTracks(tracks) {
  const map = new Map();
  for (const row of tracks || []) {
    const key = trackIdentityKey(row);
    if (key && row.id != null) map.set(key, row.id);
  }
  return map;
}

/** Apply optimistic library patch (player heart ↔ library page). */
export function applyLibraryPatch(detail, setLibrary, setPlaylists) {
  const { op, track, id } = detail || {};
  if (!track) return;
  const normalized = normalizeTrack(track);
  if (!normalized) return;

  if (op === 'add') {
    setLibrary((prev) => {
      if (prev.some((row) => tracksMatch(row, normalized))) return prev;
      const row = {
        ...normalized,
        id: id ?? normalized.id,
        added_at: normalized.added_at || new Date().toISOString(),
      };
      const next = [row, ...prev];
      writeGuestLibrary(next);
      return next;
    });
    return;
  }

  if (op === 'remove') {
    setLibrary((prev) => {
      const next = prev.filter((row) => !tracksMatch(row, normalized));
      if (next.length === prev.length) return prev;
      writeGuestLibrary(next);
      return next;
    });
    if (setPlaylists) {
      setPlaylists((prev) => {
        const next = prev.map((p) => ({
          ...p,
          tracks: (p.tracks || []).filter((tr) => !tracksMatch(tr, normalized)),
        }));
        writeGuestPlaylists(next);
        return next;
      });
    }
    return;
  }

  if (op === 'confirm' && id != null) {
    setLibrary((prev) => {
      const next = prev.map((row) => (
        tracksMatch(row, normalized) ? { ...row, id } : row
      ));
      writeGuestLibrary(next);
      return next;
    });
    return;
  }

  if (op === 'dj-meta') {
    const { provider_id, bpm, camelot_key, musical_key } = detail || {};
    if (provider_id == null || !bpm || !camelot_key) return;
    setLibrary((prev) => {
      const next = prev.map((row) => (
        String(row.provider_id) === String(provider_id)
          ? { ...row, bpm, camelot_key, musical_key: musical_key || row.musical_key }
          : row
      ));
      writeGuestLibrary(next);
      return next;
    });
  }
}

/** Sync liked-map from library patch events. */
export function applyLikedMapPatch(detail, setLikedTracks) {
  const { op, track, id } = detail || {};
  if (!track) return;
  const key = trackIdentityKey(track);
  if (!key) return;

  if (op === 'add' && id != null) {
    setLikedTracks((prev) => {
      const next = new Map(prev);
      next.set(key, id);
      return next;
    });
    return;
  }

  if (op === 'remove') {
    setLikedTracks((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    return;
  }

  if (op === 'confirm' && id != null) {
    setLikedTracks((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, id);
      return next;
    });
  }
}
