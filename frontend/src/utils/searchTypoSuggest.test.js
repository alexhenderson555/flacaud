import { describe, it, expect } from 'vitest';
import {
  damerauLevenshtein,
  suggestTokenTypo,
  suggestMangledSuffix,
  getSmartSearchSuggestion,
} from './searchTypoSuggest';
import { suggestSearchCorrection } from './searchQueryFix';

describe('damerauLevenshtein', () => {
  it('counts transposition', () => {
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
  });
});

describe('suggestTokenTypo', () => {
  const vocab = ['Radiohead', 'Beatles', 'Daft Punk'];

  it('fixes radhead → Radiohead', () => {
    expect(suggestTokenTypo('radhead', vocab)?.text).toBe('Radiohead');
  });

  it('fixes beetles → Beatles', () => {
    expect(suggestTokenTypo('beetles', vocab)?.text).toBe('Beatles');
  });

  it('ignores close valid words', () => {
    expect(suggestTokenTypo('Daft', vocab)).toBeNull();
  });
});

describe('suggestMangledSuffix', () => {
  it('strips junk after artist prefix', () => {
    expect(suggestMangledSuffix('shimzadfgfdgd', ['Shimza'])).toBe('Shimza');
  });
});

describe('getSmartSearchSuggestion', () => {
  it('layout + vocab → Major Lazer (ьфщк дфяук)', () => {
    const s = getSmartSearchSuggestion('ьфщк дфяук', {
      vocabulary: ['Major Lazer', 'Calvin Harris'],
    });
    expect(s?.text).toBe('Major Lazer');
    expect(s?.kind).toBe('layout');
    expect(s?.autoApply).toBe(true);
  });
  it('prefers keyboard layout over typo', () => {
    const s = getSmartSearchSuggestion('ghbdtn', { vocabulary: ['hello'] });
    expect(s?.kind).toBe('layout');
    expect(s?.text).toBe('привет');
  });

  it('suggests vocabulary typo', () => {
    const s = getSmartSearchSuggestion('radhead', { vocabulary: ['Radiohead'] });
    expect(s?.kind).toBe('typo');
    expect(s?.text).toBe('Radiohead');
    expect(s?.autoApply).toBe(true);
  });

  it('does not break artist names', () => {
    expect(getSmartSearchSuggestion('Daft Punk', { vocabulary: ['Radiohead'] })).toBeNull();
    expect(suggestSearchCorrection('Daft Punk')).toBeNull();
  });
});
