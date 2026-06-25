import { describe, it, expect } from 'vitest';
import { fixKeyboardLayout, suggestSearchCorrection } from './searchQueryFix.js';

describe('searchQueryFix', () => {
  it('converts latin typed as wrong layout to cyrillic', () => {
    expect(fixKeyboardLayout('ghbdtn')).toBe('привет');
  });

  it('suggests correction for keyboard mash without english vowels', () => {
    expect(suggestSearchCorrection('ghbdtn')).toBe('привет');
  });

  it('does not suggest for valid latin words like sitze', () => {
    expect(suggestSearchCorrection('sitze')).toBeNull();
  });

  it('does not suggest for artist names', () => {
    expect(suggestSearchCorrection('Daft Punk')).toBeNull();
  });

  it('suggests EN from Cyrillic keyboard mash (дфяук)', () => {
    expect(suggestSearchCorrection('дфяук')).toBe('lazer');
  });

  it('returns null when no layout fix needed', () => {
    expect(suggestSearchCorrection('Smooth Operator')).toBeNull();
  });
});
