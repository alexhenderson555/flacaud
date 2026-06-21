import { useEffect, useState } from 'react';
import { showToast } from '../utils/toast';
import { hasAuthSession } from '../utils/hasAuthSession';
import { validateSession, getStoredEffectivePlan, tryRefreshAccessToken } from '../utils/authSession';
import { primeMediaToken } from '../utils/mediaToken';
import { dispatchDjPrefsChanged } from '../utils/djPrefs';
import { reportClientMetric } from '../clientObservability';

/**
 * Session, plan, DJ prefs, and media gate for the app shell.
 */
export function useAppAuth({
  lang,
  clearPlayerState,
  hydratePlayerFromStorage,
}) {
  const [sessionReady, setSessionReady] = useState(() => !hasAuthSession());
  const [planReady, setPlanReady] = useState(() => !hasAuthSession());
  const [mediaEnabled, setMediaEnabled] = useState(() => hasAuthSession());
  const [authTick, setAuthTick] = useState(0);
  const [effectivePlan, setEffectivePlan] = useState(() => getStoredEffectivePlan());
  const [djAnalysisEnabled, setDjAnalysisEnabled] = useState(false);

  useEffect(() => {
    const bump = () => setAuthTick((n) => n + 1);
    const onAuthExpired = (e) => {
      if (!e.detail?.silent) {
        showToast(e.detail?.message || (lang === 'ru' ? 'Сессия истекла' : 'Session expired'));
      }
      setMediaEnabled(false);
      clearPlayerState();
      bump();
    };
    const onLogin = () => {
      setEffectivePlan(getStoredEffectivePlan());
      setPlanReady(true);
      setMediaEnabled(true);
      // Avoid doing potentially heavy localStorage hydration in the same tick as login.
      queueMicrotask
        ? queueMicrotask(() => hydratePlayerFromStorage())
        : setTimeout(() => hydratePlayerFromStorage(), 0);
      bump();
    };
    const onPlan = (e) => setEffectivePlan(e.detail?.plan || getStoredEffectivePlan());
    window.addEventListener('tidal-auth-expired', onAuthExpired);
    window.addEventListener('tidal-auth-login', onLogin);
    window.addEventListener('tidal-plan-update', onPlan);
    return () => {
      window.removeEventListener('tidal-auth-expired', onAuthExpired);
      window.removeEventListener('tidal-auth-login', onLogin);
      window.removeEventListener('tidal-plan-update', onPlan);
    };
  }, [lang, clearPlayerState, hydratePlayerFromStorage]);

  useEffect(() => {
    setEffectivePlan(getStoredEffectivePlan());
  }, [authTick]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      let token = hasAuthSession();
      if (!token) {
        const refreshed = await tryRefreshAccessToken();
        token = refreshed || hasAuthSession();
      }
      if (!token) {
        setMediaEnabled(false);
        setPlanReady(true);
        clearPlayerState();
        setSessionReady(true);
        return;
      }

      setPlanReady(false);
      validateSession()
        .then((result) => {
          if (cancelled) return;
          if (!result?.ok) {
            const stillLoggedIn = hasAuthSession();
            setMediaEnabled(stillLoggedIn);
            setPlanReady(true);
            if (!stillLoggedIn) {
              clearPlayerState();
              setAuthTick((n) => n + 1);
            }
            return;
          }
          setEffectivePlan(result.plan || getStoredEffectivePlan());
          const djOn = !!result.dj_enabled;
          setDjAnalysisEnabled(djOn);
          if (djOn) dispatchDjPrefsChanged();
          setPlanReady(true);
          setMediaEnabled(true);
          void primeMediaToken();
          // Defer player hydration so the app shell can render first.
          queueMicrotask
            ? queueMicrotask(() => hydratePlayerFromStorage())
            : setTimeout(() => hydratePlayerFromStorage(), 0);
        })
        .catch(() => {
          if (!cancelled) {
            setMediaEnabled(hasAuthSession());
            setPlanReady(true);
          }
        })
        .finally(() => {
          if (!cancelled) setSessionReady(true);
        });
    };

    boot();
    return () => { cancelled = true; };
  }, [authTick, clearPlayerState, hydratePlayerFromStorage]);

  useEffect(() => {
    let lastRecheck = 0;
    const RECHECK_MIN_MS = 120_000;
    const recheck = () => {
      if (!hasAuthSession()) return;
      const now = Date.now();
      if (now - lastRecheck < RECHECK_MIN_MS) return;
      lastRecheck = now;
      validateSession()
        .then((result) => {
          if (!result?.ok) {
            if (!hasAuthSession()) {
              setAuthTick((n) => n + 1);
              showToast(lang === 'ru' ? 'Сессия истекла — войдите снова' : 'Session expired — please log in again');
            }
            return;
          }
          setEffectivePlan(result.plan || getStoredEffectivePlan());
          setDjAnalysisEnabled(!!result.dj_enabled);
        })
        .catch(() => { /* offline */ });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lang]);

  useEffect(() => {
    if (!sessionReady || !mediaEnabled) return;
    const raw = sessionStorage.getItem('tidal-login-start-ms');
    if (!raw) return;
    const started = Number(raw);
    if (!Number.isFinite(started) || started <= 0) {
      sessionStorage.removeItem('tidal-login-start-ms');
      return;
    }
    const elapsed = Date.now() - started;
    if (elapsed > 0 && elapsed < 120_000) {
      reportClientMetric('login_interactive_ms', elapsed, { lang });
    }
    sessionStorage.removeItem('tidal-login-start-ms');
  }, [sessionReady, mediaEnabled, lang]);

  return {
    sessionReady,
    planReady,
    mediaEnabled,
    setMediaEnabled,
    authTick,
    effectivePlan,
    djAnalysisEnabled,
    setDjAnalysisEnabled,
  };
}
