import { describe, it, expect, vi, afterEach } from 'vitest';
import { snapPlaybackRate, rampPlaybackRate } from './playbackRateRamp';

describe('snapPlaybackRate', () => {
  it('snaps near 1.0', () => {
    expect(snapPlaybackRate(1.004)).toBe(1);
    expect(snapPlaybackRate(0.996)).toBe(1);
  });

  it('clamps range', () => {
    expect(snapPlaybackRate(2)).toBe(1.5);
    expect(snapPlaybackRate(0.1)).toBe(0.5);
  });
});

describe('rampPlaybackRate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends at target rate', () => {
    vi.useFakeTimers();
    const audio = { playbackRate: 1.12, _rateRampTimer: null };
    rampPlaybackRate(audio, 1, { durationMs: 48 });
    vi.runAllTimers();
    expect(audio.playbackRate).toBe(1);
  });
});
