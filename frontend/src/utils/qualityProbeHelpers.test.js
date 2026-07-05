import { describe, expect, it } from 'vitest';
import { probeLosslessMeta, normalizeProbeResult } from './qualityProbeHelpers';

describe('probeLosslessMeta', () => {
  it('returns empty when no lossless block', () => {
    expect(probeLosslessMeta(null)).toEqual({});
    expect(probeLosslessMeta({})).toEqual({});
    expect(probeLosslessMeta({ lossless: {} })).toEqual({});
  });

  it('extracts sample rate and bit depth', () => {
    expect(probeLosslessMeta({ lossless: { sample_rate: 44100, bit_depth: 16 } }))
      .toEqual({ sampleRate: 44100, bitDepth: 16 });
  });

  it('defaults bit depth to null when missing', () => {
    expect(probeLosslessMeta({ lossless: { sample_rate: 96000 } }))
      .toEqual({ sampleRate: 96000, bitDepth: null });
  });
});

describe('normalizeProbeResult', () => {
  it('falls back to HIGH-only when probe has no available tiers', () => {
    const out = normalizeProbeResult(null, 'tidal:123', undefined);
    expect(out.available).toEqual(['HIGH']);
    expect(out.downloadable).toEqual(['HIGH']);
    expect(out.max).toBe('HIGH');
    expect(out.actual).toEqual({});
    expect(out.probeData._trackKey).toBe('tidal:123');
  });

  it('falls back when available list is empty', () => {
    const out = normalizeProbeResult({ available: [] }, 'tidal:1', undefined);
    expect(out.available).toEqual(['HIGH']);
  });

  it('preserves available tiers from probe', () => {
    const out = normalizeProbeResult({
      available: ['LOW', 'HIGH', 'LOSSLESS'],
      max_quality: 'LOSSLESS',
      actual: {},
    }, 'tidal:1', undefined);
    expect(out.available).toContain('LOSSLESS');
    expect(out.max).toBe('LOSSLESS');
  });

  it('caps actual[HIGH] to HIGH when probe backfilled from lossless', () => {
    const out = normalizeProbeResult({
      available: ['HIGH', 'LOSSLESS'],
      max_quality: 'LOSSLESS',
      actual: { HIGH: 'LOSSLESS', LOSSLESS: 'LOSSLESS' },
    }, 'tidal:1', undefined);
    expect(out.actual.HIGH).toBe('HIGH');
    expect(out.actual.LOSSLESS).toBe('LOSSLESS');
  });

  it('stamps _trackKey onto probeData', () => {
    const out = normalizeProbeResult({
      available: ['HIGH'],
      max_quality: 'HIGH',
      actual: {},
    }, 'tidal:42', undefined);
    expect(out.probeData._trackKey).toBe('tidal:42');
  });

  it('uses last available tier as max when max_quality is LOW or missing', () => {
    const out = normalizeProbeResult({
      available: ['LOW', 'HIGH'],
      max_quality: 'LOW',
      actual: {},
    }, 'tidal:1', undefined);
    expect(out.max).toBe('HIGH');
  });

  it('falls back to downloadable = available when downloadable missing', () => {
    const out = normalizeProbeResult({
      available: ['HIGH', 'LOSSLESS'],
      max_quality: 'LOSSLESS',
      actual: {},
    }, 'tidal:1', undefined);
    expect(out.downloadable).toEqual(out.available);
  });
});
