import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setIdFromUrl,
  upsertSetLibraryEntry,
  readSetLibrary,
  isSetInLibrary,
  removeSetFromLibrary,
  analyzerQueryForSet,
  deriveSetTitle,
  resolveSetDisplayTitle,
  isAnalyzerProgressLabel,
} from './setLibrary';

describe('setLibrary', () => {
  const store = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    });
  });

  it('dedupes by url', () => {
    upsertSetLibraryEntry({ url: 'https://youtu.be/abc', title: 'Mix A' });
    upsertSetLibraryEntry({ url: 'https://youtu.be/abc', title: 'Mix B' });
    expect(readSetLibrary()).toHaveLength(1);
    expect(readSetLibrary()[0].title).toBe('Mix B');
  });

  it('tracks membership', () => {
    const url = 'https://soundcloud.com/x/set';
    expect(isSetInLibrary(url)).toBe(false);
    upsertSetLibraryEntry({ url });
    expect(isSetInLibrary(url)).toBe(true);
    removeSetFromLibrary(url);
    expect(isSetInLibrary(url)).toBe(false);
  });

  it('builds analyzer deep link', () => {
    const q = analyzerQueryForSet('https://youtu.be/x', { play: true, analyze: true });
    expect(q).toContain('play=1');
    expect(q).toContain('analyze=1');
    expect(setIdFromUrl('https://youtu.be/x')).toBeTruthy();
  });

  it('derives SoundCloud title from url path', () => {
    const url = 'https://soundcloud.com/grouptherapy-record/phil-de-group-therapy-set-wav';
    expect(deriveSetTitle(url)).toBe('Grouptherapy Record — Phil De Group Therapy Set Wav');
  });

  it('rejects analyzer status labels as display titles', () => {
    const url = 'https://soundcloud.com/grouptherapy-record/phil-de-group-therapy-set-wav';
    expect(isAnalyzerProgressLabel('Analysis complete')).toBe(true);
    expect(resolveSetDisplayTitle({ title: 'Analysis complete', url })).toBe(
      'Grouptherapy Record — Phil De Group Therapy Set Wav',
    );
    expect(resolveSetDisplayTitle({ title: 'My custom name', url })).toBe('My custom name');
  });
});
