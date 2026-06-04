/**
 * Fetch wrapper: timeout, clearer errors, optional auth header.
 */

const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function apiBase() {
  return window.__TAURI__ ? 'http://localhost:8000' : '';
}

async function apiFetchOnce(path, options) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = false,
    headers: extraHeaders = {},
    ...rest
  } = options;

  const headers = new Headers(extraHeaders);
  if (auth) {
    const token = localStorage.getItem('tidal-token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (rest.signal) {
    rest.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  try {
    return await fetch(`${apiBase()}${path}`, { ...rest, headers, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out — server is slow, try again', { code: 'timeout' });
    }
    const msg = err?.message && err.message !== 'Failed to fetch'
      ? err.message
      : 'Network error — server unreachable or connection queue is full';
    throw new ApiError(msg, { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path, options = {}) {
  const { retries = 0, ...rest } = options;
  let lastErr;
  const attempts = Math.max(0, retries) + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      return await apiFetchOnce(path, rest);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ApiError && (err.code === 'network' || err.code === 'timeout');
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function messageForApiError(err, lang = 'en') {
  if (!(err instanceof ApiError)) return lang === 'ru' ? 'Ошибка сети' : 'Network error';
  if (err.code === 'timeout') {
    return lang === 'ru' ? 'Таймаут — сервер не ответил, попробуйте снова' : err.message;
  }
  if (err.code === 'network') {
    return lang === 'ru'
      ? 'Сервер не ответил вовремя — подождите и попробуйте снова (или Ctrl+Shift+R)'
      : err.message;
  }
  return err.message;
}
