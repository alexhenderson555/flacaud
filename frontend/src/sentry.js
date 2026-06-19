/** Sentry browser reporting — enabled when VITE_SENTRY_DSN is set at build time. */

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
      sendDefaultPii: false,
    });
  }).catch(() => {
    /* optional dependency */
  });
}
