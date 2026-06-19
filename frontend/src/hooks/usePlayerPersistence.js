import { useEffect, useMemo } from 'react';
import { debounce } from '../utils/debounce';
import { serializeTrackForStorage, tracksMatch } from '../utils/trackNormalize';

export function usePlayerPersistence({
  mediaEnabled,
  playlist,
  currentTrackIndex,
  setCurrentTrackIndex,
  currentTrack,
  playlistRef,
  currentTrackIndexRef,
  currentTrackRef,
}) {
  useEffect(() => { playlistRef.current = playlist; }, [playlist, playlistRef]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex, currentTrackIndexRef]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack, currentTrackRef]);

  useEffect(() => {
    if (!mediaEnabled) return;
    try {
      const slim = serializeTrackForStorage(currentTrack);
      if (slim) localStorage.setItem('tidal-current-track', JSON.stringify(slim));
      else localStorage.removeItem('tidal-current-track');
    } catch (e) {
      console.warn('Could not persist current track', e);
    }
  }, [currentTrack, mediaEnabled]);

  const persistPlaylist = useMemo(
    () => debounce((pl, idx) => {
      try {
        const slimPlaylist = (pl || []).map(serializeTrackForStorage).filter(Boolean);
        localStorage.setItem('tidal-current-playlist', JSON.stringify(slimPlaylist));
        localStorage.setItem('tidal-current-index', String(idx));
      } catch (e) {
        console.warn('Could not persist playlist', e);
      }
    }, 400),
    [],
  );

  useEffect(() => {
    if (!mediaEnabled) return;
    persistPlaylist(playlist, currentTrackIndex);
  }, [playlist, currentTrackIndex, persistPlaylist, mediaEnabled]);

  useEffect(() => {
    if (!currentTrack || !playlist?.length) return;
    const idx = playlist.findIndex((tr) => tracksMatch(tr, currentTrack));
    if (idx !== -1 && idx !== currentTrackIndex) setCurrentTrackIndex(idx);
  }, [currentTrack, playlist, currentTrackIndex, setCurrentTrackIndex]);
}
