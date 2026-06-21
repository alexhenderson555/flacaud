import { describe, it, expect, vi } from 'vitest';
import { applyLibraryPatch, applyLikedMapPatch, likedMapFromTracks } from './librarySync';

describe('likedMapFromTracks', () => {
  it('maps provider identity to db id', () => {
    const map = likedMapFromTracks([
      { id: 5, provider: 'tidal', provider_id: '42', title: 'T' },
    ]);
    expect(map.get('tidal:42')).toBe(5);
  });
});

describe('applyLibraryPatch', () => {
  it('adds track to library and persists via setter', () => {
    const setLibrary = vi.fn((updater) => updater([]));
    const setPlaylists = vi.fn();
    applyLibraryPatch({
      op: 'add',
      id: 9,
      track: { provider_id: '1', title: 'A', provider: 'tidal' },
    }, setLibrary, setPlaylists);
    expect(setLibrary).toHaveBeenCalled();
    const next = setLibrary.mock.calls[0][0]([]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(9);
  });

  it('removes track from library and playlists', () => {
    const track = { provider_id: '1', title: 'A', provider: 'tidal', id: 2 };
    const setLibrary = vi.fn((updater) => updater([track]));
    const setPlaylists = vi.fn((updater) => updater([{
      id: 1,
      name: 'P',
      tracks: [track],
    }]));
    applyLibraryPatch({ op: 'remove', track }, setLibrary, setPlaylists);
    expect(setLibrary.mock.calls[0][0]([track])).toEqual([]);
    expect(setPlaylists.mock.calls[0][0]([{ id: 1, tracks: [track] }])[0].tracks).toEqual([]);
  });
});

describe('applyLikedMapPatch', () => {
  it('adds liked key on add op', () => {
    const setLiked = vi.fn((updater) => updater(new Map()));
    applyLikedMapPatch({
      op: 'add',
      id: 3,
      track: { provider_id: '7', provider: 'tidal' },
    }, setLiked);
    const next = setLiked.mock.calls[0][0](new Map());
    expect(next.get('tidal:7')).toBe(3);
  });
});
