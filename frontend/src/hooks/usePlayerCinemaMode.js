import { useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { isTypingTarget } from '../utils/landingCinemaKeys';

/**
 * Cinema / hidden mode. `C` toggles a chrome-less, visualizer-first view; `Esc`
 * exits. Toggles the `app-cinema-active` <html> class so CSS can hide the
 * sidebar / page / player bar. Mirrors the landing cinema pattern.
 *
 * Player hotkeys keep working (this is a separate global listener that only
 * claims `C`/`Esc`), and modal overlays (queue, EQ, …) layer above the overlay.
 */
export function usePlayerCinemaMode() {
  const cinema = usePlayerStore((s) => s.cinema);
  const setCinema = usePlayerStore((s) => s.setCinema);
  const toggleCinema = usePlayerStore((s) => s.toggleCinema);

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Escape' && usePlayerStore.getState().cinema) {
        e.preventDefault();
        setCinema(false);
        return;
      }
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleCinema();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCinema, toggleCinema]);

  useEffect(() => {
    document.documentElement.classList.toggle('app-cinema-active', cinema);
    return () => document.documentElement.classList.remove('app-cinema-active');
  }, [cinema]);

  return cinema;
}
