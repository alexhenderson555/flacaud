/**
 * Wire the main <audio> element into Web Audio (analyser + destination).
 * Safe to call multiple times; createMediaElementSource runs once per element.
 */
export function initAudioEngine(audioRef) {
  const el = audioRef?.current;
  if (!el) return false;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return false;

  if (!window.audioCtx) {
    window.audioCtx = new AudioContextCtor();
  }
  const ctx = window.audioCtx;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (!el._sourceNode) {
    try {
      const source = ctx.createMediaElementSource(el);
      el._sourceNode = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      el._analyser = analyser;
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (err) {
      console.warn('Audio routing failed:', err);
      return false;
    }
  }

  return Boolean(el._analyser);
}

/** Resume Web Audio after autoplay policy suspended the context. */
export function resumeAudioContext() {
  const ctx = window.audioCtx;
  if (ctx?.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function getAudioAnalyser(audioRef) {
  return audioRef?.current?._analyser ?? null;
}
