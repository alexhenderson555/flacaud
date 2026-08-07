import { useEffect } from 'react';

const SEEK_STEP = 5;

// Tracks in-flight seek-without-click cycles per <audio> element. Rapid repeated
// seeks (e.g. holding/spamming the seek hotkey) start a new mute/restore cycle
// before the previous one's `seeked` event (or its 250ms fallback) has fired.
// Without this, each nested call re-reads `el.muted`, which the prior call has
// already forced to `true` — so it captures a "was muted" state of `true` for
// itself. Whichever call's restore happens to finish last then sets
// `el.muted = true` permanently, since nothing else ever flips it back. The
// <audio> element is reused across track changes (only `src` changes), so
// that stuck mute silently carries into every later track until a full reload
// creates a fresh element.
const seekMuteState = new WeakMap();

/**
 * Seeking by writing `currentTime` mid-playback produces an audible click at the
 * waveform discontinuity. Mute across the seek and restore once it lands (on the
 * `seeked` event, with a safety timeout) so the jump is silent. Overlapping calls
 * on the same element share one "was muted" snapshot (taken before the first
 * seek in the burst) and only unmute once every outstanding seek has settled.
 */
export function seekWithoutClick(el, time) {
  if (!el) return;
  const target = Math.max(0, Math.min(el.duration || Infinity, time));

  let state = seekMuteState.get(el);
  if (!state) {
    state = { wasMuted: el.muted, pending: 0 };
    seekMuteState.set(el, state);
  }
  state.pending += 1;

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    el.removeEventListener('seeked', settle);
    state.pending -= 1;
    if (state.pending <= 0) {
      el.muted = state.wasMuted;
      seekMuteState.delete(el);
    }
  };
  el.muted = true;
  el.addEventListener('seeked', settle, { once: true });
  el.currentTime = target;
  setTimeout(settle, 250);
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
      const active = document.activeElement;
      // Seek/volume sliders are <input type="range"> -- tagName INPUT, but
      // they don't accept typed text, so global hotkeys should keep working
      // while one holds focus (e.g. right after dragging the seek bar).
      const isTextEntry = active?.tagName === 'TEXTAREA'
        || active?.tagName === 'SELECT'
        || (active?.tagName === 'INPUT' && active?.type !== 'range');
      if (isTextEntry) {
        if (e.key === 'Escape') active?.blur?.();
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
          if (e.ctrlKey || e.metaKey) break;
          e.preventDefault();
          // PipMiniPlayer manages its own open/closed state locally (tied
          // to the actual browser PiP window instance) -- a custom event
          // lets this global handler trigger it without threading PiP
          // state all the way up through the outlet context, same bridge
          // pattern as flacaud:command-palette below.
          window.dispatchEvent(new CustomEvent('flacaud:toggle-pip'));
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
