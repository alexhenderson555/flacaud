import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  markSeekActivity,
  resetPlaybackPriorityForTests,
  setPlaybackPriorityState,
  shouldDeferBackgroundMedia,
  isDjAnalysisBlockedForTrack,
} from './playbackPriority.js';

describe('playbackPriority', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPlaybackPriorityForTests();
  });

  it('defers only while buffering, not during steady play', () => {
    expect(shouldDeferBackgroundMedia()).toBe(false);
    setPlaybackPriorityState({ loading: true });
    expect(shouldDeferBackgroundMedia()).toBe(true);
    setPlaybackPriorityState({ loading: false });
    expect(shouldDeferBackgroundMedia()).toBe(false);
  });

  it('defers briefly after seek', () => {
    markSeekActivity(5000);
    expect(shouldDeferBackgroundMedia()).toBe(true);
    vi.advanceTimersByTime(5001);
    expect(shouldDeferBackgroundMedia()).toBe(false);
  });

  it('blocks analysis for the active track', () => {
    setPlaybackPriorityState({ currentTrackId: '123' });
    expect(isDjAnalysisBlockedForTrack('123')).toBe(true);
    expect(isDjAnalysisBlockedForTrack('456')).toBe(false);
  });
});
