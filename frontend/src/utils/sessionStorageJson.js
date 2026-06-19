/** Safe JSON.parse for sessionStorage values. */
export function readSessionJson(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(key);
    return fallback;
  }
}
