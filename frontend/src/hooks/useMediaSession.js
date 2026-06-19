import { useEffect, useRef } from 'react';
import { proxiedCoverUrl } from '../utils/coverUrl';
import { BRAND_LOGO_SRC } from '../brand';

/**
 * Keeps OS media controls (lock screen, notification shade) stable across track changes.
 * Handlers are registered once; only metadata and playbackState update per track.
 */
export function useMediaSession({
  enabled,
  currentTrack,
  isPlaying,
  isLoading,
  audioRef,
  playNext,
  playPrevious,
}) {
  const handlersBoundRef = useRef(false);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator)) return undefined;

    const onPlay = () => { audioRef.current?.play(); };
    const onPause = () => { audioRef.current?.pause(); };

    if (!handlersBoundRef.current) {
      try {
        navigator.mediaSession.setActionHandler('play', onPlay);
        navigator.mediaSession.setActionHandler('pause', onPause);
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious?.());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext?.());
        handlersBoundRef.current = true;
      } catch {
        /* unsupported action */
      }
    }

    return undefined;
  }, [enabled, audioRef, playNext, playPrevious]);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator) || !currentTrack) return;

    try {
      const cover = proxiedCoverUrl(currentTrack.cover_url) || BRAND_LOGO_SRC;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || '',
        artist: currentTrack.artists?.length
          ? currentTrack.artists.join(', ')
          : 'Unknown Artist',
        album: currentTrack.album || '',
        artwork: [
          { src: cover, sizes: '96x96', type: 'image/jpeg' },
          { src: cover, sizes: '128x128', type: 'image/jpeg' },
          { src: cover, sizes: '256x256', type: 'image/jpeg' },
          { src: cover, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    } catch {      /* ignore */
    }
  }, [
    enabled,
    currentTrack?.provider_id,
    currentTrack?.title,
    currentTrack?.album,
    currentTrack?.cover_url,
    currentTrack?.artists,
  ]);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator)) return;

    let state = 'none';
    if (currentTrack) {
      state = (isPlaying || isLoading) ? 'playing' : 'paused';
    }
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      /* ignore */
    }
  }, [enabled, currentTrack?.provider_id, isPlaying, isLoading]);
}
