import { describe, expect, it } from 'vitest';
import {
  barBinRange,
  barDisplayValue,
  bandEqualizerGain,
  computeBarLevels,
  mirroredSpectrumIndex,
  sampleBandAverage,
  sampleBandPeak,
  smoothBarLevels,
  spectrumSlotCount,
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

describe('mirroredSpectrumIndex', () => {
  it('maps both edges to the lowest spectrum slot', () => {
    expect(mirroredSpectrumIndex(0, 100)).toBe(0);
    expect(mirroredSpectrumIndex(99, 100)).toBe(0);
    expect(mirroredSpectrumIndex(50, 100)).toBe(49);
  });
});

describe('spectrumSlotCount', () => {
  it('uses half the bars for unique frequency bands', () => {
    expect(spectrumSlotCount(100)).toBe(50);
    expect(spectrumSlotCount(101)).toBe(51);
  });
});

describe('barBinRange', () => {
  it('covers the musical spectrum across bars', () => {
    const barCount = 64;
    const binCount = 256;
    const first = barBinRange(0, barCount, binCount);
    const last = barBinRange(barCount - 1, barCount, binCount);

    expect(first.start).toBe(0);
    expect(first.end).toBeGreaterThan(1);
    expect(last.end).toBeLessThanOrEqual(binCount);
    expect(last.start).toBeGreaterThan(first.start);
  });
});

describe('sampleBandPeak', () => {
  it('reads the loudest bin in each band', () => {
    const barCount = 32;
    const binCount = 256;
    for (let bar = 0; bar < barCount; bar += 1) {
      const { start } = barBinRange(bar, barCount, binCount);
      const data = new Uint8Array(binCount);
      data.fill(10);
      data[start] = 200;
      expect(sampleBandPeak(data, bar, barCount)).toBe(200);
    }
  });
});

describe('sampleBandAverage', () => {
  it('reads the mean energy in each band', () => {
    const barCount = 32;
    const binCount = 256;
    const { start, end } = barBinRange(5, barCount, binCount);
    const data = new Uint8Array(binCount);
    data.fill(10);
    for (let i = start; i < end; i += 1) data[i] = 40;
    const avg = sampleBandAverage(data, 5, barCount);
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(60);
  });
});

describe('bandEqualizerGain', () => {
  it('lifts higher spectrum slots slightly', () => {
    expect(bandEqualizerGain(0, 10)).toBeLessThan(bandEqualizerGain(9, 10));
  });
});

describe('computeBarLevels', () => {
  it('puts bass energy in the center and stays symmetric', () => {
    const data = new Uint8Array(256);
    data.fill(12);
    data[2] = 240;
    data[3] = 220;
    const levels = computeBarLevels(data, 1400);
    const center = levels[Math.floor(levels.length / 2)];
    expect(center).toBeGreaterThan(30);
    expect(center).toBeGreaterThan(levels[0]); // center (bass) louder than the treble edge
    expect(Math.abs(levels[0] - levels[levels.length - 1])).toBeLessThan(8);
  });

  it('renders mid-range energy in the inner bars, not just the center', () => {
    const data = new Uint8Array(256);
    data.fill(15);
    for (let i = 20; i < 60; i += 1) data[i] = 180;
    const levels = computeBarLevels(data, 1200);
    const peak = Math.max(...levels);
    expect(peak).toBeGreaterThan(60);
    expect(peak).toBeGreaterThan(levels[0]);
  });

  it('does not pin every low bar to max when bass dominates', () => {
    const data = new Uint8Array(256);
    data.fill(20);
    data[2] = 255;
    data[3] = 240;
    const levels = computeBarLevels(data, 1200);
    expect(levels[0]).toBeLessThan(255);
    expect(levels[levels.length - 1]).toBeLessThan(255);
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
