/** Short-lived access token storage (refresh token lives in httpOnly cookie). */



const ACCESS_KEY = 'tidal-token';



export function getAccessToken() {
  try {
    return sessionStorage.getItem(ACCESS_KEY) || localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}



export function persistAccessToken(token) {
  if (!token) return;
  try {
    sessionStorage.setItem(ACCESS_KEY, token);
    try {
      localStorage.setItem(ACCESS_KEY, token);
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}



export function clearAccessToken() {

  try {

    sessionStorage.removeItem(ACCESS_KEY);

    localStorage.removeItem(ACCESS_KEY);

  } catch { /* ignore */ }

}



/** One-time migration from legacy localStorage token — keep both stores in sync. */
export function migrateLegacyToken() {
  try {
    const legacy = localStorage.getItem(ACCESS_KEY);
    const session = sessionStorage.getItem(ACCESS_KEY);
    const token = session || legacy;
    if (token) persistAccessToken(token);
  } catch { /* ignore */ }
}

