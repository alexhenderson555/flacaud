// Short-lived media token for media URLs that ride in a query string
// (<audio src>, <a href> downloads) — so the long-lived 7-day session JWT
// never lands in server access logs or browser history.
//
// Cached in memory and refreshed shortly before expiry. Never throws: on
// failure it returns '' so the URL still forms (and simply 401s, as before).

let _token = '';
let _exp = 0; // epoch seconds

export async function getMediaToken() {
  const now = Date.now() / 1000;
  if (_token && _exp - 30 > now) return _token;
  try {
    const base = window.__TAURI__ ? 'http://localhost:8000' : '';
    const jwt = localStorage.getItem('tidal-token') || '';
    const res = await fetch(`${base}/api/auth/media-token`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return '';
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
