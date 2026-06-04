import { describe, it, expect } from 'vitest';
import { cacheKeyFor } from './cache.js';

describe('cacheKeyFor', () => {
  it('builds stable key from provider id and quality', () => {
    const track = { provider: 'tidal', provider_id: '12345' };
    expect(cacheKeyFor(track, 'LOSSLESS')).toBe('tidal_12345_LOSSLESS');
    expect(cacheKeyFor(track, 'HIGH')).toBe('tidal_12345_HIGH');
  });

  it('defaults quality to HIGH', () => {
    expect(cacheKeyFor({ provider: 'tidal', provider_id: '1' })).toBe('tidal_1_HIGH');
  });
});
