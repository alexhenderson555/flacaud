import { describe, it, expect } from 'vitest';
import { getActiveLyricIndex } from './lyrics.js';

describe('getActiveLyricIndex', () => {
  const lyrics = [
    { time: 5, text: 'First' },
    { time: 12, text: 'Second' },
    { time: 20, text: 'Third' },
  ];

  it('highlights first line during intro before first timestamp', () => {
    expect(getActiveLyricIndex(lyrics, 0)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 4.9)).toBe(0);
  });

  it('switches at each timestamp boundary', () => {
    expect(getActiveLyricIndex(lyrics, 5)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 11.9)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 12)).toBe(1);
    expect(getActiveLyricIndex(lyrics, 19.9)).toBe(1);
    expect(getActiveLyricIndex(lyrics, 20)).toBe(2);
  });

  it('returns -1 for empty lyrics', () => {
    expect(getActiveLyricIndex([], 10)).toBe(-1);
    expect(getActiveLyricIndex(null, 10)).toBe(-1);
  });

  it('handles lyrics starting at zero', () => {
    const fromZero = [{ time: 0, text: 'Start' }, { time: 8, text: 'Next' }];
    expect(getActiveLyricIndex(fromZero, 0)).toBe(0);
    expect(getActiveLyricIndex(fromZero, 7)).toBe(0);
    expect(getActiveLyricIndex(fromZero, 8)).toBe(1);
  });
});
