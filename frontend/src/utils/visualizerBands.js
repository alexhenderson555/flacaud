/** Bars across the viewport – capped by FFT resolution so each column maps to unique bins. */
export function targetBarCount(viewportWidth, binCount = 128) {
  const desired = Math.min(140, Math.max(56, Math.floor(viewportWidth / 14)));
  const usableBins = Math.max(32, binCount - 1);
  return Math.min(desired, usableBins);
}

/** Log-spaced FFT bin range so lows and highs both get visible columns. */
export function barBinRange(barIndex, barCount, binCount) {
  if (binCount <= 1 || barCount <= 0) return { start: 0, end: 1 };

  const minBin = Math.min(4, binCount - 2);
  const maxBin = binCount - 1;
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  const t0 = barIndex / barCount;
  const t1 = (barIndex + 1) / barCount;
  const start = Math.min(maxBin, Math.floor(Math.exp(logMin + t0 * (logMax - logMin))));
  let end = Math.min(
    binCount,
    Math.max(start + 1, Math.floor(Math.exp(logMin + t1 * (logMax - logMin)))),
  );
  if (barIndex === barCount - 1) end = binCount;
  return { start, end };
}

export function sampleBandPeak(data, barIndex, barCount) {
  const { start, end } = barBinRange(barIndex, barCount, data.length);
  let peak = 0;
  for (let b = start; b < end; b += 1) {
    if (data[b] > peak) peak = data[b];
  }
  return peak;
}

export function sampleBandAverage(data, barIndex, barCount) {
  const { start, end } = barBinRange(barIndex, barCount, data.length);
  let sum = 0;
  let count = 0;
  for (let b = start; b < end; b += 1) {
    sum += data[b];
    count += 1;
  }
  return count ? sum / count : 0;
}

/** Attenuate sub-bass dominance; lift treble slightly so the right side stays visible. */
export function bandEqualizerGain(barIndex, barCount) {
  const t = barCount > 1 ? barIndex / (barCount - 1) : 0;
  return 0.5 + t * 0.65;
}

/** Legacy helper – prefer computeBarLevels for rendering. */
export function barDisplayValue(peak, barIndex, barCount) {
  const t = barCount > 1 ? barIndex / (barCount - 1) : 0;
  const shaped = Math.pow(peak / 255, 0.72) * 255;
  return Math.min(255, shaped * (0.55 + t * 0.45));
}

/**
 * Map FFT bins → bar heights with per-frame normalization so lows don't peg at max
 * and quiet treble bins still show motion across the full viewport width.
 */
export function computeBarLevels(data, viewportWidth) {
  const barCount = targetBarCount(viewportWidth, data.length);
  const raw = new Float32Array(barCount);
  let max = 0;

  for (let i = 0; i < barCount; i += 1) {
    const avg = sampleBandAverage(data, i, barCount);
    const shaped = Math.pow(avg / 255, 0.72) * 255;
    const weighted = shaped * bandEqualizerGain(i, barCount);
    raw[i] = weighted;
    if (weighted > max) max = weighted;
  }

  const floor = max * 0.1;
  const span = Math.max(1, max - floor);
  const levels = new Uint8Array(barCount);
  for (let i = 0; i < barCount; i += 1) {
    const norm = Math.max(0, (raw[i] - floor) / span);
    levels[i] = Math.min(255, Math.round(Math.pow(norm, 1.12) * 255));
  }
  return levels;
}

/** Attack/decay smoothing so bars animate instead of flickering. */
export function smoothBarLevels(previous, target, attack = 0.42, decay = 0.16) {
  const count = target.length;
  const out = previous?.length === count ? previous : new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const prev = out[i] ?? target[i];
    const blend = target[i] > prev ? attack : decay;
    out[i] = prev + (target[i] - prev) * blend;
  }
  return out;
}
