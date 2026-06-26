import { useCallback, useEffect, useState } from 'react';
import { isLandingCinemaToggleKey, isTypingTarget } from '../utils/landingCinemaKeys';

/** Easter egg: Shift+V (physical V key) toggles landing cinema — video only. Escape exits. */
export function useLandingCinemaMode() {
  const [cinema, setCinema] = useState(false);

  const toggle = useCallback(() => {
    setCinema((v) => !v);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;

      if (e.code === 'Escape' && cinema) {
        e.preventDefault();
        setCinema(false);
        return;
      }

      if (isLandingCinemaToggleKey(e)) {
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
