import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { apiDelete, apiGetJson, apiPostJson } from '../utils/apiClient';
import { hasAuthSession } from '../utils/hasAuthSession';
import { readCachedLibraryTracks } from '../utils/libraryApi';
import { dispatchLibraryPatch, LIBRARY_PATCH_EVENT } from '../utils/libraryPatch';
import { applyLikedMapPatch, likedMapFromTracks } from '../utils/librarySync';
import { normalizeArtists, trackIdentityKey } from '../utils/trackNormalize';

export function useLibraryLikes(t, { enabled = true, lang = 'en' } = {}) {
  const [likedTracks, setLikedTracks] = useState(() => likedMapFromTracks(readCachedLibraryTracks()));

  const syncLikedMap = useCallback(async () => {
    if (!enabled || !hasAuthSession()) return;
    try {
      const data = await apiGetJson('/api/library', { auth: true, lang });
      setLikedTracks(likedMapFromTracks(data.map((row) => ({
        ...row,
        provider: row.provider || 'tidal',
        provider_id: String(row.provider_id),
      }))));
    } catch {
      /* keep cache */
    }
  }, [enabled, lang]);

  useEffect(() => {
    if (!enabled) return undefined;
    void syncLikedMap();
    return undefined;
  }, [enabled, syncLikedMap]);

  useEffect(() => {
    const onPatch = (event) => {
      applyLikedMapPatch(event.detail, setLikedTracks);
    };
    window.addEventListener(LIBRARY_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(LIBRARY_PATCH_EVENT, onPatch);
  }, []);

  useEffect(() => {
    const onLogin = () => { void syncLikedMap(); };
    window.addEventListener('tidal-auth-login', onLogin);
    return () => window.removeEventListener('tidal-auth-login', onLogin);
  }, [syncLikedMap]);

  const toggleLike = useCallback(async (track, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!track) return;
    if (!hasAuthSession()) {
      showToast(t('loginToSave'));
      return;
    }
    const key = trackIdentityKey(track);
    if (!key) return;
    const isLiked = likedTracks.has(key);
    const artists = normalizeArtists(track);
    const pId = String(track.provider_id);
    const prevMap = likedTracks;

    if (isLiked) {
      const dbId = likedTracks.get(key);
      const nextMap = new Map(likedTracks);
      nextMap.delete(key);
      setLikedTracks(nextMap);
      try {
        await apiDelete(`/api/library/${dbId}`, { auth: true, lang });
        dispatchLibraryPatch({ op: 'remove', track: { ...track, provider_id: pId } });
        showToast(t('removedFromLibrary'));
      } catch {
        setLikedTracks(prevMap);
        showToast(t('failedToRemove'));
      }
    } else {
      const nextMap = new Map(likedTracks);
      nextMap.set(key, -1);
      setLikedTracks(nextMap);
      try {
        const data = await apiPostJson('/api/library', {
          provider: track.provider || 'tidal',
          provider_id: pId,
          title: track.title || 'Unknown',
          artists_json: JSON.stringify(artists),
          cover_url: track.cover_url || null,
          duration: track.duration_s || track.duration || 0,
          album: track.album || '',
          quality: track.quality || 'LOW',
        }, { auth: true, lang });
        setLikedTracks((prev) => {
          const confirmed = new Map(prev);
          confirmed.set(key, data.id);
          return confirmed;
        });
        dispatchLibraryPatch({
          op: 'add',
          id: data.id,
          track: {
            ...track,
            id: data.id,
            provider: track.provider || 'tidal',
            provider_id: pId,
            artists,
            added_at: new Date().toISOString(),
          },
        });
        showToast(t('addedToLibrary'));
      } catch {
        setLikedTracks(prevMap);
        showToast(t('failedToAdd'));
      }
    }
  }, [likedTracks, t, lang]);

  return {
    likedTracks,
    toggleLike,
    syncLikedMap,
  };
}
