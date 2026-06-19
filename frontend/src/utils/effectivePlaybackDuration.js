/**
 * Pick a duration for progress/end detection. Browser duration can be wrong when
 * the stream metadata is truncated (partial DASH cache); catalog duration_s is more reliable.
 */
export function effectivePlaybackDuration(trackDurationSec, audioDurationSec) {
  const meta = Number(trackDurationSec);
  const audio = Number(audioDurationSec);
  const hasMeta = Number.isFinite(meta) && meta > 0;
  const hasAudio = Number.isFinite(audio) && audio > 0;

  if (!hasMeta && !hasAudio) return 0;
  if (!hasMeta) return audio;
  if (!hasAudio) return meta;

  if (audio < Math.min(30, meta * 0.2)) return meta;
  return Math.max(audio, meta);
}
