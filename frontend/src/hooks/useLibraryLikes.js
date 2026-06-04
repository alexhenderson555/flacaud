import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { normalizeArtists } from '../utils/trackNormalize';

export function useLibraryLikes(t, { enabled = true } = {}) {
  const [likedTracks, setLikedTracks] = useState(new Map());
  const [libraryRevision, setLibraryRevision] = useState(0);

  const fetchLibrary = useCallback(async () => {
    if (!enabled) return;
    const token = localStorage.getItem('tidal-token');
    if (!token) return;
    try {
      const res = await fetch('/api/library', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const map = new Map();
        data.forEach((row) => map.set(String(row.provider_id), row.id));
        setLikedTracks(map);
      }
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const toggleLike = useCallback(async (track, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!track) return;
    const token = localStorage.getItem('tidal-token');
    if (!token) {
      showToast(t('loginToSave'));
      return;
    }
    const pId = String(track.provider_id);
    const isLiked = likedTracks.has(pId);
    const artists = normalizeArtists(track);

    if (isLiked) {
      const dbId = likedTracks.get(pId);
      try {
        const res = await fetch(`/api/library/${dbId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const newMap = new Map(likedTracks);
          newMap.delete(pId);
          setLikedTracks(newMap);
          setLibraryRevision((r) => r + 1);
          showToast(t('removedFromLibrary'));
        } else {
          showToast(t('failedToRemove'));
        }
      } catch {
        showToast(t('networkError'));
      }
    } else {
      try {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            provider: track.provider || 'tidal',
            provider_id: pId,
            title: track.title || 'Unknown',
            artists_json: JSON.stringify(artists),
            cover_url: track.cover_url || null,
            duration: track.duration_s || track.duration || 0,
            album: track.album || '',
            quality: track.quality || 'LOW',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const newMap = new Map(likedTracks);
          newMap.set(pId, data.id);
          setLikedTracks(newMap);
          setLibraryRevision((r) => r + 1);
          showToast(t('addedToLibrary'));
        } else {
          showToast(t('failedToAdd'));
        }
      } catch {
        showToast(t('networkError'));
      }
    }
  }, [likedTracks, t]);

  return {
    likedTracks,
    libraryRevision,
    setLibraryRevision,
    fetchLibrary,
    toggleLike,
  };
}
