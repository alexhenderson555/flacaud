import { describe, it, expect } from 'vitest';
import { fixKeyboardLayout, suggestSearchCorrection } from './searchQueryFix.js';

describe('searchQueryFix', () => {
  it('converts latin typed as wrong layout to cyrillic', () => {
    expect(fixKeyboardLayout('ghbdtn')).toBe('привет');
  });

  it('suggests correction when layout mismatch', () => {
    expect(suggestSearchCorrection('ghbdtn')).toBe('привет');
  });

  it('returns null when no layout fix needed', () => {
    expect(suggestSearchCorrection('Daft Punk')).toBeNull();
  });
});
