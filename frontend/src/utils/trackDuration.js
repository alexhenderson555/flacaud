/** Seconds from a track row (library, playlist, set cache). */
export function trackDurationSeconds(track) {
  if (!track) return 0;
  for (const key of ['duration', 'duration_s', 'duration_seconds']) {
    const val = track[key];
    if (val == null) continue;
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 0;
}

export function sumTrackDurations(tracks) {
  if (!Array.isArray(tracks)) return 0;
  return tracks.reduce((sum, tr) => sum + trackDurationSeconds(tr), 0);
}

/** @param {number} totalSec */
export function formatDurationSeconds(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  if (sec < 1) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

/**
 * @param {number} count
 * @param {number} totalSec
 * @param {(key: string) => string} [t]
 */
export function formatTrackCountAndDuration(count, totalSec, t) {
  const n = Math.max(0, Number(count) || 0);
  const dur = formatDurationSeconds(totalSec);
  const trackWord = n === 1
    ? (t?.('libTrackWord') || 'track')
    : (t?.('libTracksWord') || 'tracks');
  if (n === 0 && totalSec < 1) return `0 ${trackWord} · 0:00`;
  return `${n} ${trackWord} · ${dur}`;
}
