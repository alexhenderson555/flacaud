import { describe, expect, it } from 'vitest';
import { stemSplitterDict, tStem } from './stemSplitterDict';

describe('stemSplitterDict', () => {
  it('has matching keys in en and ru', () => {
    const enKeys = Object.keys(stemSplitterDict.en).sort();
    const ruKeys = Object.keys(stemSplitterDict.ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('returns Russian copy', () => {
    expect(tStem('splitTrack', 'ru')).toBe('Разделить трек');
  });

  it('falls back to English', () => {
    expect(tStem('vocals', 'de')).toBe('Vocals');
  });
});
