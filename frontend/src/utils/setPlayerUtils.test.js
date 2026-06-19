import { describe, expect, it } from 'vitest';
import { canPlaySetUrl } from './setPlayerUtils';

describe('canPlaySetUrl', () => {
  it('accepts youtube and soundcloud urls', () => {
    expect(canPlaySetUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(canPlaySetUrl('https://youtu.be/abc')).toBe(true);
    expect(canPlaySetUrl('https://soundcloud.com/artist/set')).toBe(true);
    expect(canPlaySetUrl('https://snd.sc/xyz')).toBe(true);
  });

  it('rejects other hosts', () => {
    expect(canPlaySetUrl('https://tidal.com/browse/playlist/x')).toBe(false);
    expect(canPlaySetUrl('')).toBe(false);
  });
});
