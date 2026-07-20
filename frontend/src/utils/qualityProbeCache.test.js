import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readQualityProbeCache, writeQualityProbeCache } from './qualityProbeCache';

describe('qualityProbeCache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when nothing is cached', () => {
    expect(readQualityProbeCache('tidal', '123')).toBeNull();
  });

  it('round-trips a write then read for the same provider+track', () => {
    const data = { available: ['HIGH', 'LOSSLESS'], max_quality: 'LOSSLESS' };
    writeQualityProbeCache('tidal', '123', data);
    expect(readQualityProbeCache('tidal', '123')).toEqual(data);
  });

  it('keys are scoped per provider+track — no cross-track leakage', () => {
    writeQualityProbeCache('tidal', '123', { max_quality: 'LOSSLESS' });
    expect(readQualityProbeCache('tidal', '456')).toBeNull();
    expect(readQualityProbeCache('spotify', '123')).toBeNull();
  });

  it('expires an entry once the hour-long TTL elapses', () => {
    const data = { max_quality: 'LOSSLESS' };
    const start = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(start);
    writeQualityProbeCache('tidal', '123', data);

    // Still within the TTL window — a revisited track during a normal
    // listening session should not re-trigger the quality probe round trip.
    vi.spyOn(Date, 'now').mockReturnValue(start + 59 * 60 * 1000);
    expect(readQualityProbeCache('tidal', '123')).toEqual(data);

    // Past the TTL — treated as stale and removed.
    vi.spyOn(Date, 'now').mockReturnValue(start + 61 * 60 * 1000);
    expect(readQualityProbeCache('tidal', '123')).toBeNull();
    expect(sessionStorage.getItem('tidal-quality-probe-tidal:123')).toBeNull();
  });

  it('treats corrupted JSON as a cache miss rather than throwing', () => {
    sessionStorage.setItem('tidal-quality-probe-tidal:123', '{not json');
    expect(readQualityProbeCache('tidal', '123')).toBeNull();
  });
});
