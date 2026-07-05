import { describe, expect, it } from 'vitest';
import { transitionFinderDict } from '../locales/transitionFinderDict';

describe('ArtistLine accessibility pattern', () => {
  it('transition finder dict covers UI labels used on page', () => {
    const required = [
      'title', 'titleBold', 'desc', 'seedPlaceholder', 'results',
      'bpmTolerance', 'refresh',
    ];
    for (const key of required) {
      expect(transitionFinderDict.en[key], key).toBeTruthy();
      expect(transitionFinderDict.ru[key], key).toBeTruthy();
    }
  });
});
