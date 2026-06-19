import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../utils/toast';
import { ApiError, messageForApiError } from '../utils/apiClient';
import {
  createPlaylistApi,
  deleteLibraryTrackApi,
  deletePlaylistApi,
  enrichTracksFromApi,
  enrichTracksFromLibrary,
  fetchLibraryTracks,
  fetchPlaylists,
  mergeGuestDataOnLogin,
  mapLibraryApiRows,
  playlistIdsMatch,
  readGuestLibrary,
  readGuestPlaylists,
  updatePlaylistTracksApi,
  writeGuestLibrary,
  writeGuestPlaylists,
} from '../utils/libraryApi';
import { mapPlaylistTrack, normalizeTrack, tracksMatch } from '../utils/trackNormalize';
import { claimPendingShareAfterLogin } from '../utils/shareApi';
import { LIBRARY_PATCH_EVENT, LIBRARY_TRANSFER_DONE } from '../utils/libraryPatch';
import { useEnrichLibraryArtists } from './useEnrichLibraryArtists';

import { hasAuthSession } from '../utils/hasAuthSession';

function hasAuth() {
  return hasAuthSession();
}

function mapGuestPlaylists(rows) {
  return (rows || []).map((p) => ({
    ...p,
    tracks: (p.tracks || []).map(mapPlaylistTrack).filter(Boolean),
  }));
}

export function useLibraryData(revision = 0, lang = 'en') {
  const [library, setLibrary] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  const libraryRef = useRef(library);
  libraryRef.current = library;
  const loadErrorToastAt = useRef(0);

  useEnrichLibraryArtists(library, setLibrary);

  const toastLoadError = useCallback((err) => {
    const now = Date.now();
    if (now - loadErrorToastAt.current < 2000) return;
    loadErrorToastAt.current = now;
    showToast(messageForApiError(err, lang));
  }, [lang]);

  const loadLibraryTracks = useCallback(async () => {
    setLibraryLoading(true);
    try {
      if (hasAuth()) {
        const rows = await fetchLibraryTracks(lang);
        const enriched = await enrichTracksFromApi(rows, lang);
        setLibrary(enriched);
        writeGuestLibrary(enriched);
        return enriched;
      }
      const guest = readGuestLibrary().map((t) => normalizeTrack(t)).filter(Boolean);
      setLibrary(guest);
      return guest;
    } catch (err) {
      toastLoadError(err);
      if (!hasAuth()) {
        const guest = mapLibraryApiRows(readGuestLibrary());
        setLibrary(guest);
        return guest;
      }
      return libraryRef.current;
    } finally {
      setLibraryLoading(false);
    }
  }, [lang, toastLoadError]);

  const loadPlaylistsData = useCallback(async (libraryRows) => {
    setPlaylistsLoading(true);
    const lib = libraryRows ?? libraryRef.current;
    try {
      if (hasAuth()) {
        const pl = await fetchPlaylists(lang);
        const fromLib = pl.map((p) => ({
          ...p,
          tracks: enrichTracksFromLibrary(p.tracks, lib),
        }));
        const enriched = await Promise.all(
          fromLib.map(async (p) => ({
            ...p,
            tracks: await enrichTracksFromApi(p.tracks, lang),
          })),
        );
        setPlaylists(enriched);
        writeGuestPlaylists(enriched);
      } else {
        setPlaylists(mapGuestPlaylists(readGuestPlaylists()));
      }
    } catch (err) {
      toastLoadError(err);
      if (!hasAuth()) setPlaylists(mapGuestPlaylists(readGuestPlaylists()));
    } finally {
      setPlaylistsLoading(false);
    }
  }, [lang, toastLoadError]);

  const reloadAll = useCallback(async () => {
    const rows = await loadLibraryTracks();
    await loadPlaylistsData(rows);
  }, [loadLibraryTracks, loadPlaylistsData]);

  const guestMergeDone = useRef(false);
  const postLoginSyncInFlight = useRef(false);

  const runPostLoginSync = useCallback(async () => {
    if (postLoginSyncInFlight.current) return;
    postLoginSyncInFlight.current = true;
    try {
      // First load server-side library/playlists so UI becomes responsive quickly.
      const rows = await loadLibraryTracks();
      await loadPlaylistsData(rows);
      window.dispatchEvent(new CustomEvent('tidal-sets-changed'));
      guestMergeDone.current = true;

      // Kick off guest merge + pending share claim in the background without blocking the UI.
      void mergeGuestDataOnLogin(lang)
        .then(() => claimPendingShareAfterLogin(lang))
        .then((claimed) => {
          if (!claimed?.ok) return;
          const msg = lang === 'ru'
            ? (claimed.already_had
              ? (claimed.kind === 'set' ? 'Сет уже был в медиатеке' : 'Плейлист уже был в медиатеке')
              : (claimed.kind === 'set' ? 'Сет добавлен в медиатеку' : 'Плейлист добавлен в медиатеку'))
            : (claimed.already_had
              ? (claimed.kind === 'set' ? 'Set is already in your library' : 'Playlist is already in your library')
              : (claimed.kind === 'set' ? 'Set added to your library' : 'Playlist added to your library'));
          showToast(msg);
        })
        .catch((err) => {
          console.error('Guest merge failed', err);
        });
    } finally {
      postLoginSyncInFlight.current = false;
    }
  }, [lang, loadLibraryTracks, loadPlaylistsData]);

  useEffect(() => {
    if (!library.length) return;
    setPlaylists((prev) => (
      prev.length
        ? prev.map((p) => ({
          ...p,
          tracks: enrichTracksFromLibrary(p.tracks, library),
        }))
        : prev
    ));
  }, [library]);

  useEffect(() => {
    const onTransfer = () => {
      if (hasAuth()) void reloadAll();
    };
    window.addEventListener(LIBRARY_TRANSFER_DONE, onTransfer);
    return () => window.removeEventListener(LIBRARY_TRANSFER_DONE, onTransfer);
  }, [reloadAll]);

  useEffect(() => {
    const onPatch = (event) => {
      const { op, track, id } = event.detail || {};
      if (!track) return;
      const normalized = normalizeTrack(track);
      if (!normalized) return;

      if (op === 'add') {
        setLibrary((prev) => {
          if (prev.some((row) => tracksMatch(row, normalized))) return prev;
          const row = {
            ...normalized,
            id: id ?? normalized.id,
            added_at: new Date().toISOString(),
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
        setPlaylists((prev) => prev.map((p) => ({
          ...p,
          tracks: (p.tracks || []).filter((tr) => !tracksMatch(tr, normalized)),
        })));
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
        const { provider_id, bpm, camelot_key, musical_key } = event.detail || {};
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
    };

    window.addEventListener(LIBRARY_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(LIBRARY_PATCH_EVENT, onPatch);
  }, []);

  useEffect(() => {
    const onLogin = () => {
      guestMergeDone.current = false;
      if (hasAuth()) void runPostLoginSync();
    };
    window.addEventListener('tidal-auth-login', onLogin);
    return () => window.removeEventListener('tidal-auth-login', onLogin);
  }, [runPostLoginSync]);

  useEffect(() => {
    if (!hasAuth()) {
      guestMergeDone.current = false;
      void loadLibraryTracks();
      return;
    }
    if (guestMergeDone.current) {
      void reloadAll();
      return;
    }
    void runPostLoginSync();
  }, [loadLibraryTracks, reloadAll, revision, lang, runPostLoginSync]);

  const removeFromLibrary = useCallback(async (providerId) => {
    const track = library.find((t) => String(t.provider_id) === String(providerId));
    const next = library.filter((t) => String(t.provider_id) !== String(providerId));
    setLibrary(next);
    writeGuestLibrary(next);
    if (hasAuth() && track?.id) {
      try {
        await deleteLibraryTrackApi(track.id, lang);
      } catch (err) {
        showToast(messageForApiError(err, lang));
      }
    }
    setPlaylists((prev) => prev.map((p) => ({
      ...p,
      tracks: enrichTracksFromLibrary(p.tracks, next),
    })));
  }, [library, lang]);

  const removeFromPlaylist = useCallback(async (playlistId, trackId) => {
    let updated = null;
    const next = playlists.map((p) => {
      if (playlistIdsMatch(p.id, playlistId)) {
        updated = { ...p, tracks: p.tracks.filter((t) => String(t.provider_id) !== String(trackId)) };
        return updated;
      }
      return p;
    });
    setPlaylists(next);
    writeGuestPlaylists(next);
    if (hasAuth() && updated) {
      try {
        await updatePlaylistTracksApi(playlistId, updated.tracks, lang);
      } catch (err) {
        showToast(messageForApiError(err, lang));
      }
    }
  }, [playlists, lang]);

  const moveTrackInPlaylist = useCallback(async (playlistId, fromIndex, toIndex) => {
    let updated = null;
    const next = playlists.map((p) => {
      if (!playlistIdsMatch(p.id, playlistId)) return p;
      const tracks = [...(p.tracks || [])];
      if (
        fromIndex < 0
        || fromIndex >= tracks.length
        || toIndex < 0
        || toIndex >= tracks.length
        || fromIndex === toIndex
      ) {
        return p;
      }
      const [moved] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, moved);
      updated = { ...p, tracks };
      return updated;
    });
    if (!updated) return;
    setPlaylists(next);
    writeGuestPlaylists(next);
    if (hasAuth()) {
      try {
        await updatePlaylistTracksApi(playlistId, updated.tracks, lang);
      } catch (err) {
        showToast(messageForApiError(err, lang));
      }
    }
  }, [playlists, lang]);

  const reorderTracksInPlaylist = useCallback(async (playlistId, orderedTracks) => {
    let updated = null;
    const next = playlists.map((p) => {
      if (!playlistIdsMatch(p.id, playlistId)) return p;
      updated = { ...p, tracks: orderedTracks || [] };
      return updated;
    });
    if (!updated) return;
    setPlaylists(next);
    writeGuestPlaylists(next);
    if (hasAuth()) {
      try {
        await updatePlaylistTracksApi(playlistId, updated.tracks, lang);
      } catch (err) {
        showToast(messageForApiError(err, lang));
      }
    }
  }, [playlists, lang]);

  const deletePlaylist = useCallback(async (playlistId) => {
    const next = playlists.filter((p) => !playlistIdsMatch(p.id, playlistId));
    setPlaylists(next);
    writeGuestPlaylists(next);
    if (hasAuth()) {
      try {
        await deletePlaylistApi(playlistId, lang);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          showToast(messageForApiError(err, lang));
        }
      }
    }
  }, [playlists, lang]);

  const addTrackToPlaylist = useCallback(async (playlistId, track) => {
    const normalized = normalizeTrack(track);
    if (!normalized) return;
    const enriched = enrichTracksFromLibrary([normalized], libraryRef.current)[0];
    let updated = null;
    const next = playlists.map((p) => {
      if (!playlistIdsMatch(p.id, playlistId)) return p;
      if (p.tracks.some((tr) => tracksMatch(tr, enriched))) return p;
      updated = { ...p, tracks: [...p.tracks, enriched] };
      return updated;
    });
    setPlaylists(next);
    writeGuestPlaylists(next);
    if (hasAuth() && updated) {
      await updatePlaylistTracksApi(playlistId, updated.tracks, lang);
    }
  }, [playlists, lang]);

  const createPlaylist = useCallback(async (name, seedTrack = null) => {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const seed = seedTrack
      ? enrichTracksFromLibrary([normalizeTrack(seedTrack)], libraryRef.current)[0]
      : null;
    let created = {
      id: `${Date.now()}`,
      name: trimmed,
      tracks: seed ? [seed] : [],
    };
    if (hasAuth()) {
      try {
        const db = await createPlaylistApi(trimmed, lang);
        created = { ...db, tracks: seed ? [seed] : [] };
        if (seed) await updatePlaylistTracksApi(created.id, created.tracks, lang);
      } catch (err) {
        showToast(messageForApiError(err, lang));
        return null;
      }
    }
    const next = [...playlists, created];
    setPlaylists(next);
    writeGuestPlaylists(next);
    return created;
  }, [playlists, lang]);

  return {
    library,
    setLibrary,
    playlists,
    setPlaylists,
    libraryLoading,
    playlistsLoading,
    loadLibraryTracks,
    loadPlaylistsData,
    reloadAll,
    removeFromLibrary,
    removeFromPlaylist,
    moveTrackInPlaylist,
    reorderTracksInPlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    createPlaylist,
  };
}
