import { describe, expect, it } from 'vitest';
import { setBrowserDict } from './setBrowserDict';

describe('setBrowserDict', () => {
  it('covers UI labels used on the Set Browser page', () => {
    const required = [
      'title', 'titleBold', 'desc', 'searchPlaceholder', 'search', 'tracklist',
      'sendForAnalysis', 'similarSets', 'noTracklistYet',
    ];
    for (const key of required) {
      expect(setBrowserDict.en[key], key).toBeTruthy();
      expect(setBrowserDict.ru[key], key).toBeTruthy();
    }
  });
});
