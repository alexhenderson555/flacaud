/** Library Transfer source platforms (UI + URL validation). */

export const SYNC_PLATFORMS = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954', soon: false },
  { id: 'apple', name: 'Apple Music', color: '#FA243C', soon: false },
  { id: 'yandex', name: 'Yandex Music', color: '#FFCC00', soon: false },
  { id: 'ytmusic', name: 'YouTube Music', color: '#FF0000', soon: false },
  { id: 'vk', name: 'VK Music', color: '#0077FF', soon: false },
  { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500', soon: false },
  { id: 'deezer', name: 'Deezer', color: '#A238FF', soon: false },
  { id: 'tidal', name: 'Tidal', color: '#00FFFF', soon: false },
];

const PLATFORM_URL_RES = {
  tidal: /(?:tidal\.com|listen\.tidal\.com)/i,
  spotify: /open\.spotify\.com\/(track|playlist|album)\//i,
  apple: /music\.apple\.com\//i,
  yandex: /music\.yandex\./i,
  ytmusic: /(?:music\.youtube\.com|youtube\.com|youtu\.be)\//i,
  vk: /vk\.com\//i,
  soundcloud: /(?:soundcloud\.com|snd\.sc)\//i,
  deezer: /deezer\.com\//i,
};

export function getSyncPlatform(id) {
  return SYNC_PLATFORMS.find((p) => p.id === id) || null;
}

export function detectPlatformFromUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  for (const platform of SYNC_PLATFORMS) {
    const re = PLATFORM_URL_RES[platform.id];
    if (re?.test(trimmed)) return platform.id;
  }
  return null;
}

export function isTransferUrl(url, platformId = null) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  if (platformId) {
    const re = PLATFORM_URL_RES[platformId];
    return Boolean(re?.test(trimmed));
  }
  return detectPlatformFromUrl(trimmed) != null;
}

/** @deprecated use isTransferUrl */
export function isTidalUrl(url) {
  return isTransferUrl(url, 'tidal');
}

export function placeholderForPlatform(platformId) {
  const samples = {
    tidal: 'https://tidal.com/browse/playlist/…',
    spotify: 'https://open.spotify.com/playlist/…',
    apple: 'https://music.apple.com/…/playlist/…',
    yandex: 'https://music.yandex.ru/playlist/…',
    ytmusic: 'https://music.youtube.com/playlist?list=…',
    vk: 'https://vk.com/audio?…',
    soundcloud: 'https://soundcloud.com/…/sets/…',
    deezer: 'https://www.deezer.com/playlist/…',
  };
  return samples[platformId] || 'https://…';
}
