/** Visualizer frame gating — trust the audio element, not React play state. */

export function visualizerAudioIsActive(audioEl) {
  return Boolean(audioEl && !audioEl.paused && !audioEl.ended);
}

export function visualizerShouldAnimate({ visibilityState, audioEl }) {
  return visibilityState !== 'hidden' && visualizerAudioIsActive(audioEl);
}

export function visualizerPeakLevel(levels) {
  if (!levels?.length) return 0;
  let peak = 0;
  for (let i = 0; i < levels.length; i += 1) {
    if (levels[i] > peak) peak = levels[i];
  }
  return peak;
}
