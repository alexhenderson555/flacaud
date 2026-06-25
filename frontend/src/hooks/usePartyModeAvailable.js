import { useEffect, useState } from 'react';

/** Flip when Party mode is ready for users. */
export const PARTY_MODE_ENABLED = false;

/** Party mode — desktop/tablet with fine pointer only (not phones). */
export function usePartyModeAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!PARTY_MODE_ENABLED) return undefined;
    const mq = window.matchMedia('(min-width: 900px) and (pointer: fine)');
    const update = () => setOk(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return PARTY_MODE_ENABLED && ok;
}
