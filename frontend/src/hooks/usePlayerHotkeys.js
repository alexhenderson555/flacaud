import { useEffect } from 'react';
import { PARTY_MODE_ENABLED } from './usePartyModeAvailable';

const SEEK_STEP = 5;

/**
 * Seeking by writing `currentTime` mid-playback produces an audible click at the
 * waveform discontinuity. Mute across the seek and restore once it lands (on the
 * `seeked` event, with a safety timeout) so the jump is silent.
 */
function seekWithoutClick(el, time) {
  if (!el) return;
  const target = Math.max(0, Math.min(el.duration || Infinity, time));
  const wasMuted = el.muted;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    el.removeEventListener('seeked', restore);
    el.muted = wasMuted;
  };
  el.muted = true;
  el.addEventListener('seeked', restore, { once: true });
  el.currentTime = target;
  setTimeout(restore, 250);
}

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
  cycleVisualMode,
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
              seekWithoutClick(el, el.currentTime + SEEK_STEP);
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
              seekWithoutClick(el, el.currentTime - SEEK_STEP);
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
        case 'KeyV':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            cycleVisualMode?.();
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

    // Bridge for UI buttons (e.g. sidebar) that want to open the palette with one
    // click without threading the overlay setter down through the layout.
    const openPalette = () => setIsCommandPaletteOpen((prev) => !prev);

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('flacaud:command-palette', openPalette);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('flacaud:command-palette', openPalette);
    };
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
    cycleVisualMode,
    audioRef,
    getMainAudioEl,
  ]);
}
