/** Brand icons for Library Transfer — bundled under /assets/sync/. */

const ASSET_FILES = {
  spotify: 'spotify.svg',
  apple: 'applemusic.svg',
  yandex: 'yandexmusic.png',
  ytmusic: 'youtubemusic.svg',
  vk: 'vk.svg',
  soundcloud: 'soundcloud.svg',
  deezer: 'deezer.svg',
  tidal: 'tidal.svg',
};

export default function PlatformIcon({ id, size = 32, className = '' }) {
  const file = ASSET_FILES[id];
  if (!file) {
    return (
      <span
        className={`platform-icon platform-icon--fallback ${className}`.trim()}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={`platform-icon ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <img src={`/assets/sync/${file}`} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}
