import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Module-level (not component state) so it survives across every page's
// mount/unmount for the life of the tab -- keyed by React Router's per
// history-entry `location.key`, not the pathname, so two visits to the same
// route (e.g. two different albums) never share a position.
const positions = new Map();

/** Restores scroll position on back/forward nav; resets to top on a fresh push. */
export function useScrollRestoration(containerRef) {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Continuously record the current page's scroll offset rather than trying
  // to catch the single moment it's navigated away from (there isn't a clean
  // "before this unmounts" hook for that in react-router).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const { key } = location;
    const onScroll = () => positions.set(key, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    if (navigationType !== 'POP' || !positions.has(location.key)) {
      el.scrollTop = 0;
      return undefined;
    }
    const target = positions.get(location.key);
    let attempts = 0;
    let rafId = null;
    // Content on the destination page often loads async (a fetch on mount);
    // scrollTop assigned before it grows in just gets clamped back to 0. Keep
    // reapplying across a few frames until it holds, or give up after ~1s.
    // The first attempt runs synchronously (not queued behind a rAF) -- a
    // backgrounded/inactive tab can throttle rAF indefinitely, and the very
    // first, immediate assignment is the one most likely to matter anyway
    // (right after the DOM for this page has just been (re)painted).
    const tryRestore = () => {
      el.scrollTop = target;
      attempts += 1;
      if (Math.abs(el.scrollTop - target) < 2 || attempts > 60) return;
      rafId = requestAnimationFrame(tryRestore);
    };
    tryRestore();
    return () => { if (rafId != null) cancelAnimationFrame(rafId); };
  }, [location.key, navigationType, containerRef]);
}
