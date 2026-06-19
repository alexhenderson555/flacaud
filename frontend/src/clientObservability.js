/** Client-side error reporting: backend logs (always) + optional Sentry. */

import { initSentry as initSentrySdk } from './sentry.js';
import { isChunkLoadError, reloadForStaleChunks } from './utils/chunkRecovery.js';

const REPORTED = new Set();
const MAX_REPORTS = 20;

function fingerprint(error, context = {}) {
  const msg = error?.message || String(error);
  return `${context.component || 'unknown'}:${msg}`.slice(0, 200);
}

function shouldReport(key) {
  if (REPORTED.size >= MAX_REPORTS) return false;
  if (REPORTED.has(key)) return false;
  REPORTED.add(key);
  return true;
}

function toPayload(error, context = {}) {
  const message = (error?.message || String(error) || 'unknown').slice(0, 500);
  const stack = (error?.stack || context.componentStack || '').slice(0, 4000);
  return {
    message,
    stack: stack || null,
    url: (context.url || window.location?.href || '').slice(0, 500),
    component: (context.component || 'unknown').slice(0, 64),
  };
}

export function reportClientError(error, context = {}) {
  const key = fingerprint(error, context);
  if (!shouldReport(key)) return;

  const payload = toPayload(error, context);

  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(error instanceof Error ? error : new Error(payload.message), {
        extra: context,
      });
    })
    .catch(() => {});
}

export function reportClientMetric(name, valueMs, context = {}) {
  if (!name || !Number.isFinite(valueMs)) return;
  const payload = {
    message: `metric:${String(name).slice(0, 64)}=${Math.round(valueMs)}ms`,
    stack: JSON.stringify({
      metric: name,
      value_ms: Math.round(valueMs),
      ...context,
    }).slice(0, 4000),
    url: (window.location?.href || '').slice(0, 500),
    component: 'perf',
  };
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function initClientObservability() {
  initSentrySdk();

  window.addEventListener('error', (event) => {
    if (!event.error && !event.message) return;
    const err = event.error || new Error(event.message);
    if (isChunkLoadError(err) && reloadForStaleChunks()) {
      event.preventDefault();
      return;
    }
    reportClientError(err, {
      component: 'window',
      url: event.filename ? `${event.filename}:${event.lineno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    if (isChunkLoadError(err) && reloadForStaleChunks()) {
      event.preventDefault();
      return;
    }
    reportClientError(err, { component: 'unhandledrejection' });
  });
}
