import { describe, expect, it } from 'vitest';
import {
  barBinRange,
  barDisplayValue,
  bandEqualizerGain,
  computeBarLevels,
  sampleBandAverage,
  sampleBandPeak,
  smoothBarLevels,
  targetBarCount,
} from './visualizerBands';

describe('targetBarCount', () => {
  it('scales with viewport width', () => {
    expect(targetBarCount(1400, 256)).toBe(100);
    expect(targetBarCount(400, 256)).toBe(56);
    expect(targetBarCount(3000, 256)).toBe(140);
  });

  it('never exceeds usable FFT bins', () => {
    expect(targetBarCount(3000, 64)).toBeLessThanOrEqual(63);
    expect(targetBarCount(1400, 128)).toBeLessThanOrEqual(127);
  });
});

describe('barBinRange', () => {
  it('covers the full spectrum across bars', () => {
    const barCount = 64;
    const binCount = 256;
    const first = barBinRange(0, barCount, binCount);
    const last = barBinRange(barCount - 1, barCount, binCount);

    expect(first.start).toBeGreaterThanOrEqual(1);
    expect(last.end).toBe(binCount);
    expect(last.start).toBeGreaterThan(first.start);
  });
});

describe('sampleBandPeak', () => {
  it('reads the loudest bin in each band', () => {
    const data = new Uint8Array([0, 10, 50, 20, 200, 5]);
    const peak = sampleBandPeak(data, 2, 3);
    expect(peak).toBe(200);
  });
});

describe('sampleBandAverage', () => {
  it('reads the mean energy in each band', () => {
    const data = new Uint8Array([0, 20, 30, 40, 50, 60]);
    const avg = sampleBandAverage(data, 1, 3);
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(60);
  });
});

describe('bandEqualizerGain', () => {
  it('attenuates lows and lifts highs', () => {
    expect(bandEqualizerGain(0, 10)).toBeLessThan(bandEqualizerGain(9, 10));
  });
});

describe('computeBarLevels', () => {
  it('fills every bar across the spectrum', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = i % 2 === 0 ? 180 : 40;
    }
    const levels = computeBarLevels(data, 1400);
    expect(levels.length).toBeGreaterThan(50);
    expect(levels[0]).toBeLessThan(255);
    expect(levels[levels.length - 1]).toBeGreaterThan(0);
  });

  it('does not pin every low bar to max when bass dominates', () => {
    const data = new Uint8Array(256);
    data.fill(20);
    data[2] = 255;
    data[3] = 240;
    const levels = computeBarLevels(data, 1200);
    const lowAvg = (levels[0] + levels[1] + levels[2]) / 3;
    const highAvg = (levels[levels.length - 3] + levels[levels.length - 2] + levels[levels.length - 1]) / 3;
    expect(lowAvg).toBeLessThan(255);
    expect(highAvg).toBeGreaterThan(0);
  });
});

describe('smoothBarLevels', () => {
  it('eases toward the target levels', () => {
    const target = new Uint8Array([100, 200]);
    const first = smoothBarLevels(new Float32Array([100, 200]), target);
    const peak = first[1];
    const second = smoothBarLevels(first, new Uint8Array([100, 50]));
    expect(first[0]).toBeCloseTo(100, 0);
    expect(second[1]).toBeLessThan(peak);
    expect(second[1]).toBeGreaterThan(50);
  });
});

describe('barDisplayValue', () => {
  it('boosts higher bars without clipping low ones', () => {
    expect(barDisplayValue(100, 0, 10)).toBeLessThan(100);
    expect(barDisplayValue(100, 9, 10)).toBeGreaterThan(barDisplayValue(100, 0, 10));
    expect(barDisplayValue(240, 9, 10)).toBeLessThanOrEqual(255);
  });
});
