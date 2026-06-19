/** Routes guests may browse without logging in. */

const GUEST_EXACT = new Set([
  '/', '/landing', '/account', '/search', '/recommendations', '/radio', '/sync',
  '/terms', '/privacy', '/verify-email', '/forgot-password', '/reset-password',
]);

export function isGuestRoute(pathname) {
  if (!pathname) return false;
  if (GUEST_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/artist/') || pathname.startsWith('/album/')) return true;
  if (pathname.startsWith('/s/')) return true;
  return false;
}
