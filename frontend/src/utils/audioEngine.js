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
      // Gain BEFORE the analyser: setting it to 0 during a track switch silences
      // both the audio output AND the analyser feed, so neither the old track's
      // lingering buffer nor the new track's pre-load blip is heard OR shows on
      // the visualizer. Pausing / el.volume=0 do not reliably mute a
      // MediaElementSource-routed element — this does.
      const gain = ctx.createGain();
      gain.gain.value = 1;
      el._gainNode = gain;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      el._analyser = analyser;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (err) {
      console.warn('Audio routing failed:', err);
      return false;
    }
  }

  return Boolean(el._analyser);
}

/**
 * Set the graph gain (0 = silent, 1 = pass) with a short ramp to avoid clicks.
 * No-op if the element isn't Web Audio–routed. Used to hard-mute across track switches.
 */
export function setGraphGain(el, target) {
  const gain = el?._gainNode;
  if (!gain) return;
  try {
    const ctx = window.audioCtx;
    if (ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.012);
    } else {
      gain.gain.value = target;
    }
  } catch {
    try { gain.gain.value = target; } catch { /* ignore */ }
  }
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
