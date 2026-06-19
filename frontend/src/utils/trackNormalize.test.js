import { describe, it, expect } from 'vitest';
import {
  buildRadioQueue,
  formatTrackYear,
  isTrackLiked,
  mapPlaylistTrack,
  normalizeTrack,
  parseArtistIds,
  trackIdentityKey,
  tracksMatch,
} from './trackNormalize';

describe('buildRadioQueue', () => {
  it('puts seed first and dedupes', () => {
    const seed = { provider_id: '1', title: 'A', artists: ['X'] };
    const q = buildRadioQueue(seed, [
      { provider_id: '2', title: 'B', artists: ['Y'] },
      { provider_id: '1', title: 'A dup', artists: ['X'] },
    ]);
    expect(q.map((t) => t.provider_id)).toEqual(['1', '2']);
  });
});

describe('formatTrackYear', () => {
  it('prefers year field', () => {
    expect(formatTrackYear({ year: 2021, release_date: '2019-01-01' })).toBe('2021');
  });

  it('derive year in normalizeTrack from release_date', () => {
    const t = normalizeTrack({ provider_id: '9', title: 'T', release_date: '2018-03-01' });
    expect(t.year).toBe(2018);
    expect(formatTrackYear(t)).toBe('2018');
  });

  it('falls back to release_date', () => {
    expect(formatTrackYear({ release_date: '2019-06-15' })).toBe('2019');
  });
});

describe('parseArtistIds', () => {
  it('reads artist_ids_json', () => {
    expect(parseArtistIds({ artist_ids_json: '["42","7"]' })).toEqual(['42', '7']);
  });
});

describe('mapPlaylistTrack', () => {
  it('fills artist_ids and album_id from slim playlist JSON', () => {
    const t = mapPlaylistTrack({
      provider_id: 123,
      title: 'Track',
      artists: ['A'],
      artist_ids_json: '["99"]',
      album_id: 55,
    });
    expect(t.provider_id).toBe('123');
    expect(t.artist_ids).toEqual(['99']);
    expect(t.album_id).toBe('55');
    expect(t.source_url).toContain('123');
  });
});

describe('trackIdentityKey', () => {
  it('includes provider in composite key', () => {
    expect(trackIdentityKey({ provider: 'tidal', provider_id: '1' })).toBe('tidal:1');
    expect(trackIdentityKey({ provider: 'ytmusic', provider_id: '1' })).toBe('ytmusic:1');
  });
});

describe('tracksMatch', () => {
  it('matches same provider and id only', () => {
    expect(tracksMatch(
      { provider: 'tidal', provider_id: '9' },
      { provider: 'tidal', provider_id: '9' },
    )).toBe(true);
    expect(tracksMatch(
      { provider: 'tidal', provider_id: '9' },
      { provider: 'ytmusic', provider_id: '9' },
    )).toBe(false);
  });
});

describe('isTrackLiked', () => {
  it('reads composite liked map keys', () => {
    const map = new Map([['tidal:42', 7]]);
    expect(isTrackLiked(map, { provider: 'tidal', provider_id: '42' })).toBe(true);
    expect(isTrackLiked(map, { provider: 'ytmusic', provider_id: '42' })).toBe(false);
  });
});

describe('normalizeTrack', () => {
  it('parses artists_json string', () => {
    const t = normalizeTrack({
      provider_id: 1,
      artists_json: '["X"]',
      artist_ids: [2],
    });
    expect(t.artists).toEqual(['X']);
    expect(t.artist_ids).toEqual(['2']);
  });
});
