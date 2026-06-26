import { useEffect } from 'react';
import { PARTY_MODE_ENABLED } from './usePartyModeAvailable';

const SEEK_STEP = 5;

/**
 * Global player keyboard shortcuts (ignored when typing in inputs).
 */
export function usePlayerHotkeys({
  enabled = true,
  currentTrack,
  playlist = [],
  isPlaying,
  audioRef,
  getMainAudioEl,
  togglePlay,
  playNext,
  playPrevious,
  toggleOverlay,
  closeAllPanels,
  setVolume,
  setIsCommandPaletteOpen,
  toggleShuffle,
  cycleRepeat,
  toggleLike,
  startTrackRadio,
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const resolveAudio = () => getMainAudioEl?.() ?? audioRef.current;

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') document.activeElement?.blur?.();
        const paletteToggle = e.code === 'KeyK' && (e.ctrlKey || e.metaKey);
        if (!paletteToggle) return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (currentTrack) {
            togglePlay?.(currentTrack, playlist?.length ? playlist : null);
          }
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            const el = resolveAudio();
            if (el && currentTrack) {
              el.currentTime = Math.min(
                el.duration || Infinity,
                el.currentTime + SEEK_STEP,
              );
            }
          } else {
            e.preventDefault();
            playNext();
          }
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            const el = resolveAudio();
            if (el) {
              el.currentTime = Math.max(0, el.currentTime - SEEK_STEP);
            }
          } else {
            e.preventDefault();
            playPrevious();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => Math.min(1, v + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => Math.max(0, v - 0.05));
          break;
        case 'BracketRight':
          e.preventDefault();
          if (resolveAudio() && currentTrack) {
            const el = resolveAudio();
            el.currentTime = Math.min(
              el.duration || Infinity,
              el.currentTime + SEEK_STEP,
            );
          }
          break;
        case 'BracketLeft':
          e.preventDefault();
          {
            const el = resolveAudio();
            if (el) {
              el.currentTime = Math.max(0, el.currentTime - SEEK_STEP);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeAllPanels();
          break;
        case 'KeyL':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (currentTrack) toggleLike?.(currentTrack);
          }
          break;
        case 'KeyQ':
          e.preventDefault();
          toggleOverlay('queue');
          break;
        case 'KeyE':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleOverlay('eq');
          }
          break;
        case 'KeyK':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setIsCommandPaletteOpen((prev) => !prev);
          } else {
            e.preventDefault();
            toggleOverlay('karaoke');
          }
          break;
        case 'KeyP':
          if (!e.ctrlKey && !e.metaKey && PARTY_MODE_ENABLED) {
            e.preventDefault();
            toggleOverlay('party');
          }
          break;
        case 'KeyD':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleOverlay('dj');
          }
          break;
        case 'KeyF':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }
          break;
        case 'KeyM':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setVolume((v) => (v > 0 ? 0 : parseFloat(localStorage.getItem('tidal-volume') || '1') || 1));
          }
          break;
        case 'KeyS':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleShuffle?.();
          }
          break;
        case 'KeyR':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            cycleRepeat?.();
          }
          break;
        case 'KeyT':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (currentTrack) startTrackRadio?.(currentTrack);
          }
          break;
        case 'Slash':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setIsCommandPaletteOpen((prev) => !prev);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    enabled,
    currentTrack,
    playlist,
    isPlaying,
    playNext,
    playPrevious,
    togglePlay,
    toggleOverlay,
    closeAllPanels,
    setVolume,
    setIsCommandPaletteOpen,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    startTrackRadio,
    audioRef,
    getMainAudioEl,
  ]);
}
