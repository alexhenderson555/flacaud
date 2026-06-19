/**
 * Fetch wrapper: timeout, clearer errors, optional auth header.
 */

import { getAccessToken } from './tokenStorage';

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
    const token = getAccessToken();
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

export function codeFromBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const detail = body.detail;
  if (detail && typeof detail === 'object' && detail.code) return detail.code;
  if (typeof body.code === 'string') return body.code;
  return undefined;
}

export function detailFromBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const detail = body.detail;
  if (detail && typeof detail === 'object' && detail.message) return detail.message;
  if (typeof detail === 'string') return detail;
  return undefined;
}

export function messageForApiError(err, lang = 'en') {
  if (!(err instanceof ApiError)) return lang === 'ru' ? 'Ошибка сети' : 'Network error';
  if (err.code === 'stream_failed') {
    return lang === 'ru'
      ? 'Не удалось запустить воспроизведение — попробуйте другой трек или качество'
      : 'Could not start playback — try another track or quality';
  }
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

export async function apiGetJson(path, options = {}) {
  const res = await apiFetch(path, { ...options, method: 'GET' });
  return parseJsonSafe(res);
}
export async function apiPostJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return parseJsonSafe(res);
}
export async function apiPutJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return parseJsonSafe(res);
}
export async function apiDeleteJson(path, options = {}) {
  const res = await apiFetch(path, { ...options, method: 'DELETE' });
  return parseJsonSafe(res);
}

export async function apiPatchJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return parseJsonSafe(res);
}

export async function apiDelete(path, options = {}) {
  return apiFetch(path, { ...options, method: 'DELETE' });
}
