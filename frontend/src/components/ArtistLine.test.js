import { describe, expect, it } from 'vitest';
import { stemSplitterDict } from '../locales/stemSplitterDict';

describe('ArtistLine accessibility pattern', () => {
  it('stem splitter dict covers UI labels used on page', () => {
    const required = [
      'title', 'titleBold', 'desc', 'placeholder', 'splitTrack', 'splitting',
      'vocals', 'instrumental', 'downloadFlac',
    ];
    for (const key of required) {
      expect(stemSplitterDict.en[key], key).toBeTruthy();
      expect(stemSplitterDict.ru[key], key).toBeTruthy();
    }
  });
});
