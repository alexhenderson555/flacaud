/** Tidal CDN art blocks hotlinking — load covers via same-origin proxy. */
export function proxiedCoverUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/api/image-proxy')) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
