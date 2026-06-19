/** Parse YouTube / SoundCloud set URLs for native widget embeds (not react-player). */

/** Compact SC classic player (visual=false) — not the tall artwork widget. */
export const SOUND_CLOUD_EMBED_HEIGHT = 166;

export function classifySetUrl(url) {
  const u = String(url || '');
  if (/youtube\.com|youtu\.be/i.test(u)) return 'youtube';
  if (/soundcloud\.com|snd\.sc/i.test(u)) return 'soundcloud';
  return null;
}

export function parseYoutubeVideoId(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (u.searchParams.get('v')) {
      return u.searchParams.get('v');
    }
    const parts = u.pathname.split('/').filter(Boolean);
    const embedIdx = parts.indexOf('embed');
    if (embedIdx >= 0 && parts[embedIdx + 1]) {
      return parts[embedIdx + 1];
    }
    const shortsIdx = parts.indexOf('shorts');
    if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
      return parts[shortsIdx + 1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Canonical page URL for SoundCloud widget (strip tracking query params). */
export function normalizeSoundCloudEmbedUrl(url) {
  try {
    const u = new URL(url.trim());
    if (!/soundcloud\.com|snd\.sc/i.test(u.hostname)) {
      return url.trim();
    }
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url || '').trim();
  }
}

export function soundCloudWidgetSrc(pageUrl) {
  const clean = normalizeSoundCloudEmbedUrl(pageUrl);
  const params = new URLSearchParams({
    url: clean,
    color: '#ff5500',
    auto_play: 'false',
    hide_related: 'true',
    show_comments: 'false',
    show_user: 'true',
    show_reposts: 'false',
    show_teaser: 'false',
    visual: 'false',
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}
