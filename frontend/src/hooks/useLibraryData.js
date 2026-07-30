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
  readCachedLibraryTracks,
  readCachedPlaylists,
  readGuestLibrary,
  readGuestPlaylists,
  updatePlaylistTracksApi,
  writeGuestLibrary,
  writeGuestPlaylists,
} from '../utils/libraryApi';
import { mapPlaylistTrack, normalizeTrack, tracksMatch } from '../utils/trackNormalize';
import { claimPendingShareAfterLogin } from '../utils/shareApi';
import {
  LIBRARY_PATCH_EVENT,
  LIBRARY_RELOAD_REQUEST,
  LIBRARY_TRANSFER_DONE,
} from '../utils/libraryPatch';
import { applyLibraryPatch } from '../utils/librarySync';
import { useEnrichLibraryArtists } from './useEnrichLibraryArtists';
import { hasAuthSession } from '../utils/hasAuthSession';

function mapGuestPlaylists(rows) {
  return (rows || []).map((p) => ({
    ...p,
    tracks: (p.tracks || []).map(mapPlaylistTrack).filter(Boolean),
  }));
}

export function useLibraryData(lang = 'en') {
  const [library, setLibrary] = useState(readCachedLibraryTracks);
  const [playlists, setPlaylists] = useState(readCachedPlaylists);
  const [libraryLoading, setLibraryLoading] = useState(
    () => hasAuthSession() && readCachedLibraryTracks().length === 0,
  );
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  const libraryRef = useRef(library);
  libraryRef.current = library;
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const loadErrorToastAt = useRef(0);
  const libraryFetchGenRef = useRef(0);
  const playlistsFetchGenRef = useRef(0);
  const guestMergeDone = useRef(false);
  const postLoginSyncInFlight = useRef(false);

  useEnrichLibraryArtists(library, setLibrary);

  const toastLoadError = useCallback((err) => {
    const now = Date.now();
    if (now - loadErrorToastAt.current < 2000) return;
    loadErrorToastAt.current = now;
    showToast(messageForApiError(err, lang));
  }, [lang]);

  const loadLibraryTracks = useCallback(async ({ background = false } = {}) => {
    const hasCache = libraryRef.current.length > 0;
    if (!background && !hasCache) setLibraryLoading(true);

    const gen = libraryFetchGenRef.current + 1;
    libraryFetchGenRef.current = gen;

    try {
      if (hasAuthSession()) {
        const rows = await fetchLibraryTracks(lang);
        if (gen !== libraryFetchGenRef.current) return rows;
        setLibrary(rows);
        writeGuestLibrary(rows);
        void enrichTracksFromApi(rows, lang).then((enriched) => {
          if (gen !== libraryFetchGenRef.current) return;
          setLibrary(enriched);
          writeGuestLibrary(enriched);
        });
        return rows;
      }
      const guest = readGuestLibrary().map((t) => normalizeTrack(t)).filter(Boolean);
      if (gen === libraryFetchGenRef.current) setLibrary(guest);
      return guest;
    } catch (err) {
      toastLoadError(err);
      if (!hasAuthSession()) {
        const guest = mapLibraryApiRows(readGuestLibrary());
        if (gen === libraryFetchGenRef.current) setLibrary(guest);
        return guest;
      }
      return libraryRef.current;
    } finally {
      if (gen === libraryFetchGenRef.current) setLibraryLoading(false);
    }
  }, [lang, toastLoadError]);

  const loadPlaylistsData = useCallback(async (libraryRows, { background = false } = {}) => {
    const hasCache = playlistsRef.current.length > 0;
    if (!background && !hasCache) setPlaylistsLoading(true);

    const gen = playlistsFetchGenRef.current + 1;
    playlistsFetchGenRef.current = gen;
    const lib = libraryRows ?? libraryRef.current;

    try {
      if (hasAuthSession()) {
        const pl = await fetchPlaylists(lang);
        if (gen !== playlistsFetchGenRef.current) return;
        const fromLib = pl.map((p) => ({
          ...p,
          tracks: enrichTracksFromLibrary(p.tracks, lib),
        }));
        setPlaylists(fromLib);
        writeGuestPlaylists(fromLib);
        void Promise.all(
          fromLib.map(async (p) => ({
            ...p,
            tracks: await enrichTracksFromApi(p.tracks, lang, { persistLibrary: false }),
          })),
        ).then((enriched) => {
          if (gen !== playlistsFetchGenRef.current) return;
          setPlaylists(enriched);
          writeGuestPlaylists(enriched);
        });
      } else {
        setPlaylists(mapGuestPlaylists(readGuestPlaylists()));
      }
    } catch (err) {
      toastLoadError(err);
      if (!hasAuthSession()) setPlaylists(mapGuestPlaylists(readGuestPlaylists()));
    } finally {
      if (gen === playlistsFetchGenRef.current) setPlaylistsLoading(false);
    }
  }, [lang, toastLoadError]);

  const reloadAll = useCallback(async ({ background = false } = {}) => {
    const rows = await loadLibraryTracks({ background });
    await loadPlaylistsData(rows, { background });
  }, [loadLibraryTracks, loadPlaylistsData]);

  const runPostLoginSync = useCallback(async () => {
    if (postLoginSyncInFlight.current) return;
    postLoginSyncInFlight.current = true;
    try {
      const hasCache = libraryRef.current.length > 0 || playlistsRef.current.length > 0;
      const rows = await loadLibraryTracks({ background: hasCache });
      await loadPlaylistsData(rows, { background: hasCache });
      window.dispatchEvent(new CustomEvent('tidal-sets-changed'));
      guestMergeDone.current = true;

      void mergeGuestDataOnLogin(lang)
        .then(() => claimPendingShareAfterLogin(lang))
        .then((claimed) => {
          if (!claimed?.ok) return;
          const msg = lang === 'ru'
            ? (claimed.already_had
              ? (claimed.kind === 'set' ? 'Сет уже был в медиатеке' : 'Плейлист уже был в медиатеке')
              : (claimed.kind === 'set' ? 'Сет добавлен в медиатеку' : 'Плейлист добавлен в медиатеке'))
            : (claimed.already_had
              ? (claimed.kind === 'set' ? 'Set is already in your library' : 'Playlist is already in your library')
              : (claimed.kind === 'set' ? 'Set added to your library' : 'Playlist added to your library'));
          showToast(msg);
          void reloadAll({ background: true });
        })
        .catch((err) => {
          console.error('Guest merge failed', err);
        });
    } finally {
      postLoginSyncInFlight.current = false;
    }
  }, [lang, loadLibraryTracks, loadPlaylistsData, reloadAll]);

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
      if (hasAuthSession()) void reloadAll({ background: libraryRef.current.length > 0 });
    };
    window.addEventListener(LIBRARY_TRANSFER_DONE, onTransfer);
    return () => window.removeEventListener(LIBRARY_TRANSFER_DONE, onTransfer);
  }, [reloadAll]);

  useEffect(() => {
    const onReload = () => {
      if (hasAuthSession()) void reloadAll({ background: true });
    };
    window.addEventListener(LIBRARY_RELOAD_REQUEST, onReload);
    return () => window.removeEventListener(LIBRARY_RELOAD_REQUEST, onReload);
  }, [reloadAll]);

  useEffect(() => {
    const onPatch = (event) => {
      applyLibraryPatch(event.detail, setLibrary, setPlaylists);
    };
    window.addEventListener(LIBRARY_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(LIBRARY_PATCH_EVENT, onPatch);
  }, []);

  useEffect(() => {
    const onLogin = () => {
      guestMergeDone.current = false;
      if (hasAuthSession()) void runPostLoginSync();
    };
    window.addEventListener('tidal-auth-login', onLogin);
    return () => window.removeEventListener('tidal-auth-login', onLogin);
  }, [runPostLoginSync]);

  useEffect(() => {
    if (!hasAuthSession()) {
      guestMergeDone.current = false;
      void loadLibraryTracks({ background: libraryRef.current.length > 0 });
      return;
    }
    if (!guestMergeDone.current) {
      void runPostLoginSync();
      return;
    }
    void loadLibraryTracks({ background: true });
    void loadPlaylistsData(null, { background: true });
  }, [lang, loadLibraryTracks, loadPlaylistsData, runPostLoginSync]);

  const removeFromLibrary = useCallback(async (providerId) => {
    const track = library.find((t) => String(t.provider_id) === String(providerId));
    const next = library.filter((t) => String(t.provider_id) !== String(providerId));
    setLibrary(next);
    writeGuestLibrary(next);
    if (hasAuthSession() && track?.id) {
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
    if (hasAuthSession() && updated) {
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
    if (hasAuthSession()) {
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
    if (hasAuthSession()) {
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
    if (hasAuthSession()) {
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
    if (hasAuthSession() && updated) {
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
    if (hasAuthSession()) {
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

  const [albums, setAlbums] = useState([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const albumsLoadedRef = useRef(false);

  const loadAlbums = useCallback(async () => {
    if (!hasAuthSession() || albumsLoadedRef.current) return;
    setAlbumsLoading(true);
    try {
      const { fetchSavedAlbumsApi } = await import('../utils/libraryApi');
      const data = await fetchSavedAlbumsApi(lang);
      setAlbums(data || []);
      albumsLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load albums', err);
    } finally {
      setAlbumsLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    if (hasAuthSession() && !albumsLoadedRef.current) {
      void loadAlbums();
    }
  }, [loadAlbums]);

  return {
    library,
    setLibrary,
    playlists,
    setPlaylists,
    albums,
    setAlbums,
    libraryLoading,
    playlistsLoading,
    albumsLoading,
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
