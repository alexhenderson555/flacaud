/** YouTube / SoundCloud only — avoids pulling react-player on other routes. */
export function canPlaySetUrl(url) {
  return /(?:youtube\.com|youtu\.be|soundcloud\.com|snd\.sc)/i.test(String(url || ''));
}
