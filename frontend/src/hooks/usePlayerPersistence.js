import { useEffect, useMemo } from 'react';
import { debounce } from '../utils/debounce';
import { serializeTrackForStorage, tracksMatch, mergePlaybackTracks } from '../utils/trackNormalize';

export function usePlayerPersistence({
  mediaEnabled,
  playlist,
  currentTrackIndex,
  setCurrentTrackIndex,
  setCurrentTrack,
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

  useEffect(() => {
    if (!mediaEnabled || !currentTrack?.provider_id || !playlist?.length) return;
    const plTrack = playlist.find((tr) => tracksMatch(tr, currentTrack));
    if (!plTrack) return;
    const merged = mergePlaybackTracks(currentTrack, plTrack);
    const hadArtists = (currentTrack.artists?.length || 0) > 0;
    const hasArtists = (merged.artists?.length || 0) > 0;
    const richer = (!hadArtists && hasArtists)
      || ((merged.duration_s ?? merged.duration ?? 0) > (currentTrack.duration_s ?? currentTrack.duration ?? 0));
    if (richer) setCurrentTrack(merged);
  }, [mediaEnabled, currentTrack, playlist, setCurrentTrack]);
}
