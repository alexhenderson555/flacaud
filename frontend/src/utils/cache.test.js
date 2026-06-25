import { describe, it, expect } from 'vitest';
import {
  cacheKeyFor,
  parseContentRangeTotal,
  minExpectedAudioBytes,
  isBlobCompleteEnough,
  isFetchCompleteResponse,
} from './cache.js';

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

describe('parseContentRangeTotal', () => {
  it('extracts total from Content-Range header', () => {
    expect(parseContentRangeTotal('bytes 0-524287/9000000')).toBe(9000000);
    expect(parseContentRangeTotal(null)).toBeNull();
  });
});

describe('minExpectedAudioBytes', () => {
  it('uses duration and quality bitrate', () => {
    const track = { duration_s: 180 };
    const high = minExpectedAudioBytes(track, 'HIGH');
    expect(high).toBeGreaterThan(512 * 1024);
  });

  it('returns floor above 512k when duration unknown', () => {
    expect(minExpectedAudioBytes({}, 'HIGH')).toBe(768 * 1024);
  });
});

describe('isBlobCompleteEnough', () => {
  const track = { duration_s: 180 };

  it('rejects 512k partial chunk', () => {
    const blob = { size: 512 * 1024 };
    expect(isBlobCompleteEnough(blob, track, 'HIGH')).toBe(false);
  });

  it('accepts blob above expected minimum', () => {
    const blob = { size: minExpectedAudioBytes(track, 'HIGH') };
    expect(isBlobCompleteEnough(blob, track, 'HIGH')).toBe(true);
  });
});

describe('isFetchCompleteResponse', () => {
  const track = { duration_s: 180 };
  const minBytes = minExpectedAudioBytes(track, 'HIGH');

  it('rejects 206 partial without full range', () => {
    const response = {
      ok: true,
      status: 206,
      headers: { get: (h) => (h === 'content-range' ? 'bytes 0-524287/9000000' : null) },
    };
    const blob = { size: 512 * 1024 };
    expect(isFetchCompleteResponse(response, blob)).toBe(false);
  });

  it('accepts 200 with matching content-length', () => {
    const response = {
      ok: true,
      status: 200,
      headers: { get: (h) => (h === 'content-length' ? String(minBytes) : null) },
    };
    const blob = { size: minBytes };
    expect(isFetchCompleteResponse(response, blob)).toBe(true);
  });

  it('accepts 206 when blob covers content-range total', () => {
    const total = minBytes;
    const response = {
      ok: true,
      status: 206,
      headers: { get: (h) => (h === 'content-range' ? `bytes 0-${total - 1}/${total}` : null) },
    };
    const blob = { size: total };
    expect(isFetchCompleteResponse(response, blob)).toBe(true);
  });
});
