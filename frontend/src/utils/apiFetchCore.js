/** Low-level fetch + ApiError (no authSession import — avoids circular deps with apiClient). */

import { clearAccessToken, getAccessToken, persistAccessToken } from './tokenStorage';

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

let refreshInFlight = null;

async function doRefresh() {
  try {
    const res = await apiFetchOnce('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      timeoutMs: 15000,
      retries: 0,
    });
    if (!res.ok) {
      clearAccessToken();
      return false;
    }
    const data = await parseJsonSafe(res);
    if (data?.access_token) {
      persistAccessToken(data.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function tryRefreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  // The refresh cookie is shared across every tab of the origin, but the
  // access token lives in per-tab sessionStorage -- so two tabs (or two
  // page loads from a stale-tab reload) can each decide independently that
  // they need to refresh and POST /api/auth/refresh with the SAME cookie at
  // once. The backend now tolerates one repeat within a short grace window,
  // but only within a single worker process; a cross-tab lock avoids the
  // duplicate call outright for the common case (two tabs, same browser).
  refreshInFlight = (async () => {
    try {
      if (navigator.locks?.request) {
        return await navigator.locks.request('flacaud-refresh-token', doRefresh);
      }
      return await doRefresh();
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function apiFetchOnce(path, options) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = false,
    headers: extraHeaders = {},
    credentials = 'include',
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
    return await fetch(`${apiBase()}${path}`, {
      ...rest,
      headers,
      credentials,
      signal: ctrl.signal,
    });
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
  const { retries = 0, auth = false, ...rest } = options;
  let lastErr;
  const attempts = Math.max(0, retries) + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await apiFetchOnce(path, { ...rest, auth });
      if (auth && res.status === 401 && !path.includes('/api/auth/refresh')) {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          return apiFetchOnce(path, { ...rest, auth });
        }
      }
      return res;
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

export async function logoutSession() {
  try {
    await apiFetchOnce('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch { /* ignore */ }
  clearAccessToken();
}
