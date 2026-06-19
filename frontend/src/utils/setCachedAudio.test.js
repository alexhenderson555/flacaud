import { describe, expect, it } from 'vitest';
import {
  cachedSetAudioUrl,
  invalidateCachedSetAudioProbe,
  probeCachedSetAudio,
} from './setCachedAudio.js';

describe('setCachedAudio', () => {
  it('builds encoded cached audio URL', () => {
    const url = cachedSetAudioUrl('https://soundcloud.com/foo/bar');
    expect(url).toContain('/api/sets/cached-audio?');
    expect(url).toContain(encodeURIComponent('https://soundcloud.com/foo/bar'));
  });

  it('caches probe results in memory', async () => {
    invalidateCachedSetAudioProbe('https://soundcloud.com/cache-test');
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls += 1;
      if (init?.method === 'HEAD') {
        return { ok: true };
      }
      return { ok: false };
    };
    try {
      const first = await probeCachedSetAudio('https://soundcloud.com/cache-test');
      const second = await probeCachedSetAudio('https://soundcloud.com/cache-test');
      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateCachedSetAudioProbe('https://soundcloud.com/cache-test');
    }
  });
});
