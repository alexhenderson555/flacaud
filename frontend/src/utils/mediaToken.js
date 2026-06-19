import { apiFetch } from './apiClient';
import { isBackgroundPaused } from './authBusy';
import { getAccessToken } from './tokenStorage';

// Short-lived media token for media URLs that ride in a query string
// (<audio src>, <a href> downloads) — so the long-lived 7-day session JWT
// never lands in server access logs or browser history.
//
// Cached in memory and refreshed shortly before expiry. Never throws: on
// failure it returns '' so the URL still forms (and simply 401s, as before).

let _token = '';
let _exp = 0; // epoch seconds

/** Force-fetch a new media token (call right after login). */
export async function primeMediaToken() {
  _token = '';
  _exp = 0;
  return getMediaToken({ force: true });
}

export async function getMediaToken({ force = false } = {}) {
  const now = Date.now() / 1000;
  if (!force && _token && _exp - 30 > now) return _token;
  if (!force && isBackgroundPaused()) return '';
  if (!getAccessToken()) return '';
  try {
    const res = await apiFetch('/api/auth/media-token', { auth: true, timeoutMs: 15000, retries: 1 });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('tidal-token');
        _token = '';
        _exp = 0;
        window.dispatchEvent(new CustomEvent('tidal-auth-expired', {
          detail: { message: 'Session expired — please log in again' },
        }));
      }
      return '';
    }
    const data = await res.json();
    _token = data.token || '';
    _exp = now + (data.expires_in || 3600);
    return _token;
  } catch {
    return '';
  }
}

export function clearMediaToken() {
  _token = '';
  _exp = 0;
}
