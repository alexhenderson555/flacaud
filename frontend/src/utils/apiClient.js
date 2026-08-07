/**
 * Fetch wrapper: timeout, clearer errors, optional auth header, 401 refresh.
 */

import {
  ApiError,
  apiFetch as coreApiFetch,
  parseJsonSafe,
  tryRefreshAccessToken,
  logoutSession,
} from './apiFetchCore';

export { ApiError, tryRefreshAccessToken, logoutSession };

export function apiBase() {
  return window.__TAURI__ ? 'http://localhost:8000' : '';
}

export async function apiFetch(path, options = {}) {
  return coreApiFetch(path, options);
}

export { parseJsonSafe };

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
  if (err.code === 'no_detail') {
    return lang === 'ru' ? `Ошибка сервера (${err.status ?? '?'})` : `Server error (${err.status ?? '?'})`;
  }
  return err.message;
}

async function jsonResponseOrThrow(res) {
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const detail = detailFromBody(body) || (typeof body?.detail === 'string' ? body.detail : null);
    // res.statusText is frequently empty for HTTP/2 responses (no textual
    // status line at all in the protocol) -- true for anything proxied
    // through Cloudflare, which this app always is in prod. Falling through
    // to statusText || 'Request failed' meant any error response with no
    // JSON detail (a bare 401/404/502 from Caddy, a Cloudflare-generated
    // error page) surfaced the same hardcoded English string regardless of
    // `lang`, with no indication of which request or status code it even
    // was. Marking this distinctly lets messageForApiError show a
    // translated, status-code-specific message instead.
    const message = detail || res.statusText || `HTTP ${res.status}`;
    const code = codeFromBody(body) || (detail ? 'http_error' : 'no_detail');
    throw new ApiError(message, { status: res.status, code });
  }
  return body;
}

export async function apiGetJson(path, options = {}) {
  const res = await apiFetch(path, { ...options, method: 'GET' });
  return jsonResponseOrThrow(res);
}
export async function apiPostJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return jsonResponseOrThrow(res);
}
export async function apiPutJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return jsonResponseOrThrow(res);
}
export async function apiDeleteJson(path, options = {}) {
  const res = await apiFetch(path, { ...options, method: 'DELETE' });
  return jsonResponseOrThrow(res);
}

export async function apiPatchJson(path, body, options = {}) {
  const res = await apiFetch(path, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
  return jsonResponseOrThrow(res);
}

export async function apiDelete(path, options = {}) {
  return apiFetch(path, { ...options, method: 'DELETE' });
}
