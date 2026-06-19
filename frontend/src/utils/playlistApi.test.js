import { describe, it, expect } from 'vitest';
import { tracksForPlaylistApi } from './playlistApi';

describe('tracksForPlaylistApi', () => {
  it('serializes artist_ids for API', () => {
    const out = tracksForPlaylistApi([{
      provider_id: 9,
      title: 'T',
      artists: ['A'],
      artist_ids: ['77'],
      album_id: '3',
    }]);
    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe('9');
    expect(out[0].artist_ids).toEqual(['77']);
  });
});
