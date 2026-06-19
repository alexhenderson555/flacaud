import { describe, expect, it } from 'vitest';
import { getPlaybackCurrentTime } from './playbackTime';

describe('getPlaybackCurrentTime', () => {
  it('prefers active slot element over stale audioRef', () => {
    const slot = { currentTime: 42.5 };
    const stale = { currentTime: 1 };
    const t = getPlaybackCurrentTime({
      getMainAudioEl: () => slot,
      audioRef: { current: stale },
      progress: 0,
    });
    expect(t).toBe(42.5);
  });

  it('falls back to audioRef when slot missing', () => {
    const t = getPlaybackCurrentTime({
      audioRef: { current: { currentTime: 12 } },
      progress: 99,
    });
    expect(t).toBe(12);
  });

  it('falls back to progress when no element', () => {
    expect(getPlaybackCurrentTime({ progress: 33.2 })).toBe(33.2);
    expect(getPlaybackCurrentTime({})).toBe(0);
  });
});
