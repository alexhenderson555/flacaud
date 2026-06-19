import { describe, it, expect } from 'vitest';
import { coverImgSrc, isTidalCoverUrl, proxiedCoverUrl } from './coverUrl';

describe('isTidalCoverUrl', () => {
  it('accepts resources.tidal.com art', () => {
    expect(isTidalCoverUrl('https://resources.tidal.com/images/ab/cd/ef/640x640.jpg')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isTidalCoverUrl('https://example.com/cover.jpg')).toBe(false);
    expect(isTidalCoverUrl('')).toBe(false);
  });
});

describe('proxiedCoverUrl', () => {
  it('wraps remote tidal urls', () => {
    const raw = 'https://resources.tidal.com/images/ab/cd/ef/640x640.jpg';
    expect(proxiedCoverUrl(raw)).toBe(`/api/image-proxy?url=${encodeURIComponent(raw)}`);
  });

  it('passes through already proxied urls', () => {
    expect(proxiedCoverUrl('/api/image-proxy?url=x')).toBe('/api/image-proxy?url=x');
  });
});

describe('coverImgSrc', () => {
  it('reads cover_url from track objects', () => {
    const raw = 'https://resources.tidal.com/images/ab/cd/ef/640x640.jpg';
    expect(coverImgSrc({ cover_url: raw })).toBe(proxiedCoverUrl(raw));
  });
});
