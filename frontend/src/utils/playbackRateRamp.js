/** Snap UI values near 1.0 to exactly 1.0 (avoids 0.99x display glitches). */
export function snapPlaybackRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 1;
  if (Math.abs(n - 1) < 0.006) return 1;
  return Math.max(0.5, Math.min(1.5, n));
}

/**
 * Smooth playbackRate changes to avoid clicks/pops (especially when returning to 1.0x).
 * Uses a short smoothstep ramp on the media element.
 */
export function rampPlaybackRate(audio, targetRate, { durationMs = 72 } = {}) {
  if (!audio) return () => {};

  const target = snapPlaybackRate(targetRate);
  const start = audio.playbackRate;
  if (Math.abs(start - target) < 0.002) {
    audio.playbackRate = target;
    return () => {};
  }

  if (audio._rateRampTimer) {
    clearInterval(audio._rateRampTimer);
    audio._rateRampTimer = null;
  }

  const steps = Math.max(4, Math.round(durationMs / 12));
  const stepMs = durationMs / steps;
  let step = 0;

  const timer = setInterval(() => {
    step += 1;
    const t = Math.min(1, step / steps);
    const eased = t * t * (3 - 2 * t);
    audio.playbackRate = start + (target - start) * eased;
    if (step >= steps) {
      clearInterval(timer);
      audio._rateRampTimer = null;
      audio.playbackRate = target;
    }
  }, stepMs);

  audio._rateRampTimer = timer;

  return () => {
    if (audio._rateRampTimer === timer) {
      clearInterval(timer);
      audio._rateRampTimer = null;
    }
  };
}
