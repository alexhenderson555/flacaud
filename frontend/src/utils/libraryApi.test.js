import { describe, it, expect } from 'vitest';
import { enrichTracksFromLibrary, enrichTracksFromMeta, librarySortCompare, mapLibraryApiRows, playlistIdsMatch, trackNeedsMetaEnrich, trackNeedsPlaybackEnrich } from './libraryApi';

describe('mapLibraryApiRows', () => {
  it('parses artists_json and seeds DJ features', () => {
    const rows = mapLibraryApiRows([{
      provider_id: 42,
      title: 'T',
      artists_json: '["A"]',
      bpm: 128,
      camelot_key: '8A',
    }]);
    expect(rows[0].provider_id).toBe('42');
    expect(rows[0].artists).toEqual(['A']);
  });
});

describe('enrichTracksFromLibrary', () => {
  it('fills duration and cover from liked library', () => {
    const out = enrichTracksFromLibrary(
      [{ provider_id: '1', title: 'X' }],
      [{ provider_id: '1', duration: 245, cover_url: 'https://c/1.jpg', album: 'Al' }],
    );
    expect(out[0].duration_s).toBe(245);
    expect(out[0].cover_url).toBe('https://c/1.jpg');
    expect(out[0].album).toBe('Al');
  });
});

describe('enrichTracksFromMeta', () => {
  it('fills duration and cover from batch meta rows', () => {
    const out = enrichTracksFromMeta(
      [{ provider_id: '9', title: 'Y' }],
      [{ provider_id: '9', duration_s: 180, cover_url: 'https://c/9.jpg', album: 'LP' }],
    );
    expect(out[0].duration_s).toBe(180);
    expect(out[0].cover_url).toBe('https://c/9.jpg');
    expect(out[0].album).toBe('LP');
  });
});

describe('trackNeedsMetaEnrich', () => {
  it('flags transfer rows missing release year', () => {
    expect(trackNeedsMetaEnrich({
      provider_id: '1',
      title: 'X',
      artists: ['A'],
      duration: 200,
      cover_url: 'https://c/1.jpg',
    })).toBe(true);
  });

  it('flags rows with non-tidal cover urls', () => {
    expect(trackNeedsMetaEnrich({
      provider_id: '2',
      title: 'Y',
      artists: ['B'],
      duration: 200,
      cover_url: 'https://example.com/cover.jpg',
    })).toBe(true);
    expect(trackNeedsMetaEnrich({
      provider_id: '3',
      title: 'Z',
      artists: ['C'],
      duration: 200,
      cover_url: 'https://resources.tidal.com/images/ab/cd/ef/640x640.jpg',
      release_date: '2020-01-01',
      artist_ids: ['1'],
    })).toBe(false);
  });
});

describe('trackNeedsPlaybackEnrich', () => {
  it('does not block play when only display metadata is missing', () => {
    expect(trackNeedsPlaybackEnrich({
      provider_id: '1',
      title: 'X',
      artists: ['A'],
      duration: 200,
      cover_url: 'https://c/1.jpg',
    })).toBe(false);
  });

  it('blocks play when duration is missing', () => {
    expect(trackNeedsPlaybackEnrich({
      provider_id: '1',
      title: 'X',
      artists: ['A'],
      cover_url: 'https://c/1.jpg',
    })).toBe(true);
  });
});

describe('librarySortCompare', () => {
  const a = { title: 'B', added_at: '2024-01-01' };
  const b = { title: 'A', added_at: '2023-06-01' };

  it('sorts oldest by added_at ascending', () => {
    expect(librarySortCompare(a, b, 'oldest')).toBeGreaterThan(0);
    expect(librarySortCompare(b, a, 'oldest')).toBeLessThan(0);
  });

  it('sorts newest descending', () => {
    expect(librarySortCompare(a, b, 'newest')).toBeLessThan(0);
  });
});

describe('playlistIdsMatch', () => {
  it('matches numeric and string ids', () => {
    expect(playlistIdsMatch(5, '5')).toBe(true);
    expect(playlistIdsMatch(5, 6)).toBe(false);
    expect(playlistIdsMatch(null, 5)).toBe(false);
  });
});
