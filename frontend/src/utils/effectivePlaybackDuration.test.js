import { describe, it, expect } from 'vitest';
import { effectivePlaybackDuration } from './effectivePlaybackDuration';

describe('effectivePlaybackDuration', () => {
  it('uses catalog when browser duration is truncated', () => {
    expect(effectivePlaybackDuration(260, 3)).toBe(260);
  });

  it('uses browser when close to catalog', () => {
    expect(effectivePlaybackDuration(260, 258)).toBe(260);
  });

  it('falls back to audio without meta', () => {
    expect(effectivePlaybackDuration(0, 180)).toBe(180);
  });
});
