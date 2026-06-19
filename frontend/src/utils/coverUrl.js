const TIDAL_COVER_HOSTS = ['resources.tidal.com', 'tidalcdn.com'];

/** Whether a stored cover URL looks like a Tidal art URL we can proxy. */
export function isTidalCoverUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('/api/image-proxy')) return !!trimmed;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return TIDAL_COVER_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

/** Tidal CDN art blocks hotlinking — load covers via same-origin proxy. */
export function proxiedCoverUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/api/image-proxy')) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function coverImgSrc(track) {
  if (!track) return null;
  const url = typeof track === 'string' ? track : (track.cover_url || track.coverUrl);
  return proxiedCoverUrl(url);
}
