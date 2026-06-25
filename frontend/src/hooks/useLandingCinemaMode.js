import { useCallback, useEffect, useState } from 'react';

/** Easter egg: Shift+V toggles landing cinema (video only). Escape exits. */
export function useLandingCinemaMode() {
  const [cinema, setCinema] = useState(false);

  const toggle = useCallback(() => {
    setCinema((v) => !v);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && cinema) {
        setCinema(false);
        return;
      }

      if (e.key === 'V' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cinema, toggle]);

  useEffect(() => {
    document.documentElement.classList.toggle('landing-cinema-active', cinema);
    return () => document.documentElement.classList.remove('landing-cinema-active');
  }, [cinema]);

  return cinema;
}
