/** Bars across the viewport – capped by FFT resolution so each column maps to unique bins. */
export function targetBarCount(viewportWidth, binCount = 128) {
  const desired = Math.min(140, Math.max(56, Math.floor(viewportWidth / 14)));
  const usableBins = Math.max(32, binCount - 1);
  return Math.min(desired, usableBins);
}

/** Mirror bar index so bass/mids appear on both left and right edges (symmetric EQ). */
export function mirroredSpectrumIndex(barIndex, barCount) {
  if (barCount <= 1) return 0;
  return Math.min(barIndex, barCount - 1 - barIndex);
}

/** Unique spectrum slots when mirroring (center bar is the highest band). */
export function spectrumSlotCount(barCount) {
  return Math.max(1, Math.ceil(barCount / 2));
}

/** Log-spaced FFT bin range across the musically active part of the spectrum. */
export function barBinRange(barIndex, barCount, binCount) {
  if (binCount <= 1 || barCount <= 0) return { start: 0, end: 1 };

  const maxBin = Math.max(8, Math.floor((binCount - 1) * 0.72));

  if (barIndex === 0) {
    return { start: 0, end: Math.min(binCount, 6) };
  }

  const minBin = 5;
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  const adjustedIndex = barIndex - 1;
  const adjustedCount = Math.max(1, barCount - 1);
  const t0 = adjustedIndex / adjustedCount;
  const t1 = (adjustedIndex + 1) / adjustedCount;
  const start = Math.min(maxBin, Math.floor(Math.exp(logMin + t0 * (logMax - logMin))));
  let end = Math.min(
    binCount,
    Math.max(start + 1, Math.floor(Math.exp(logMin + t1 * (logMax - logMin)))),
  );
  if (barIndex === barCount - 1) end = Math.min(binCount, maxBin + 1);
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

/** Attenuate sub-bass dominance; lift treble slightly so the center stays visible. */
export function bandEqualizerGain(barIndex, barCount) {
  const t = barCount > 1 ? barIndex / (barCount - 1) : 0;
  return 0.55 + t * 0.45;
}

/** Per-bar height from FFT peak (no global normalization that crushes quiet bands). */
export function barDisplayValue(peak, barIndex, barCount) {
  const t = barCount > 1 ? barIndex / (barCount - 1) : 0;
  const shaped = Math.pow(peak / 255, 0.72) * 255;
  return Math.min(255, shaped * bandEqualizerGain(barIndex, barCount) * (0.85 + t * 0.15));
}

/**
 * Map FFT bins → bar heights. Spectrum is mirrored so both viewport edges
 * show bass/mid energy instead of pinning highs to the right side only.
 */
export function computeBarLevels(data, viewportWidth) {
  const barCount = targetBarCount(viewportWidth, data.length);
  const specSlots = spectrumSlotCount(barCount);
  const levels = new Uint8Array(barCount);

  for (let i = 0; i < barCount; i += 1) {
    // Center bars map to bass/low-mids (the loudest, ever-present energy) and
    // fade out to the highs at both edges. This keeps the middle of the screen —
    // the most visible area — always populated instead of dead (treble is quiet).
    const specIndex = (specSlots - 1) - mirroredSpectrumIndex(i, barCount);
    const peak = sampleBandPeak(data, specIndex, specSlots);
    levels[i] = Math.round(barDisplayValue(peak, specIndex, specSlots));
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
