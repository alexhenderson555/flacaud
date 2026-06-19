import { useEffect, useState } from 'react';

/** Party mode — desktop/tablet with fine pointer only (not phones). */
export function usePartyModeAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px) and (pointer: fine)');
    const update = () => setOk(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return ok;
}
