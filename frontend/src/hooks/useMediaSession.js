import { useEffect } from 'react';
import { proxiedCoverUrl } from '../utils/coverUrl';
import { BRAND_LOGO_SRC } from '../brand';

const SEEK_STEP_SEC = 10;

function setActionHandlerSafe(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    /* action unsupported on this platform */
  }
}

/**
 * Keeps OS media controls (lock screen, notification shade) stable across track
 * changes: metadata updates per track, playbackState stays 'playing' while a
 * switch is loading, and position state powers the widget seek bar.
 */
export function useMediaSession({
  enabled,
  currentTrack,
  isPlaying,
  isLoading,
  audioRef,
  playNext,
  playPrevious,
  toggleLike,
}) {
  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator)) return undefined;

    // Re-bound on every dep change: binding once froze the first render's
    // playNext/playPrevious closures, so widget skips acted on a stale queue.
    setActionHandlerSafe('play', () => { audioRef.current?.play(); });
    setActionHandlerSafe('pause', () => { audioRef.current?.pause(); });
    setActionHandlerSafe('previoustrack', () => playPrevious?.());
    setActionHandlerSafe('nexttrack', () => playNext?.());
    
    if (toggleLike) {
      setActionHandlerSafe('thumbsup', () => {
        if (currentTrack) toggleLike(currentTrack);
      });
      setActionHandlerSafe('thumbsdown', () => {
        if (currentTrack) toggleLike(currentTrack);
      });
    }

    setActionHandlerSafe('seekto', (details) => {
      const el = audioRef.current;
      if (!el || details.seekTime == null) return;
      try {
        if (details.fastSeek && typeof el.fastSeek === 'function') {
          el.fastSeek(details.seekTime);
        } else {
          el.currentTime = details.seekTime;
        }
      } catch {
        /* not seekable yet */
      }
    });
    setActionHandlerSafe('seekbackward', (details) => {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, (el.currentTime || 0) - (details.seekOffset || SEEK_STEP_SEC));
    });
    setActionHandlerSafe('seekforward', (details) => {
      const el = audioRef.current;
      if (!el) return;
      const dur = Number.isFinite(el.duration) ? el.duration : Infinity;
      el.currentTime = Math.min(dur, (el.currentTime || 0) + (details.seekOffset || SEEK_STEP_SEC));
    });

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
      // isLoading counts as 'playing' so the OS widget survives the src swap
      // of a track switch instead of being dismissed and re-created.
      state = (isPlaying || isLoading) ? 'playing' : 'paused';
    }
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      /* ignore */
    }
  }, [enabled, currentTrack?.provider_id, isPlaying, isLoading]);

  // Position state drives the seek bar on the lock screen / notification.
  // The OS extrapolates between updates; a coarse interval only corrects
  // drift after seeks, stalls, and quality switches.
  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator) || !currentTrack) return undefined;
    if (typeof navigator.mediaSession.setPositionState !== 'function') return undefined;

    const update = () => {
      const el = audioRef.current;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: el.duration,
          playbackRate: el.playbackRate || 1,
          position: Math.min(el.currentTime || 0, el.duration),
        });
      } catch {
        /* stale values mid-load */
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [enabled, currentTrack?.provider_id, isPlaying, audioRef]);
}
