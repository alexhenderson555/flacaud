import { describe, expect, it } from 'vitest';
import {
  formatDurationSeconds,
  formatTrackCountAndDuration,
  sumTrackDurations,
  trackDurationSeconds,
} from './trackDuration';

describe('trackDuration', () => {
  it('sums mixed duration fields', () => {
    expect(sumTrackDurations([
      { duration: 60 },
      { duration_s: 90 },
      { duration_seconds: 30 },
    ])).toBe(180);
  });

  it('formats mm:ss and h:mm:ss', () => {
    expect(formatDurationSeconds(125)).toBe('2:05');
    expect(formatDurationSeconds(3665)).toBe('1:01:05');
  });

  it('formats count and duration line', () => {
    expect(formatTrackCountAndDuration(2, 380, (k) => (k === 'libTrackWord' ? 'track' : 'tracks')))
      .toBe('2 tracks · 6:20');
  });

  it('reads single track duration', () => {
    expect(trackDurationSeconds({ duration: 200 })).toBe(200);
    expect(trackDurationSeconds({})).toBe(0);
  });
});
