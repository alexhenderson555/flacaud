import { useEffect } from 'react';

const SEEK_STEP = 5;

/**
 * Global player keyboard shortcuts (ignored when typing in inputs).
 */
export function usePlayerHotkeys({
  enabled = true,
  currentTrack,
  isPlaying,
  audioRef,
  playNext,
  playPrevious,
  toggleOverlay,
  closeAllPanels,
  setVolume,
  setIsCommandPaletteOpen,
}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') document.activeElement?.blur?.();
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (currentTrack) {
            if (isPlaying) audioRef.current?.pause();
            else audioRef.current?.play();
          }
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            if (audioRef.current && currentTrack) {
              audioRef.current.currentTime = Math.min(
                audioRef.current.duration || Infinity,
                audioRef.current.currentTime + SEEK_STEP,
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
            if (audioRef.current) {
              audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - SEEK_STEP);
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
          if (audioRef.current && currentTrack) {
            audioRef.current.currentTime = Math.min(
              audioRef.current.duration || Infinity,
              audioRef.current.currentTime + SEEK_STEP,
            );
          }
          break;
        case 'BracketLeft':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - SEEK_STEP);
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeAllPanels();
          break;
        case 'KeyL':
          e.preventDefault();
          toggleOverlay('lyrics');
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
    enabled, currentTrack, isPlaying, playNext, playPrevious, toggleOverlay,
    closeAllPanels, setVolume, setIsCommandPaletteOpen, audioRef,
  ]);
}
