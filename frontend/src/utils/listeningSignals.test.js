import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordPlaybackSignal,
  getTrackScore,
  getArtistAffinity,
  getTopArtistIds,
  getDislikedArtistIds,
  filterRecommendations,
  rankRecommendations,
  clearListeningSignals,
} from './listeningSignals';

function track(id, { artistIds = ['a1'], artists = ['Artist A'], duration = 200 } = {}) {
  return {
    provider: 'tidal', provider_id: id, artist_ids: artistIds, artists, duration_s: duration,
  };
}

const store = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  });
  clearListeningSignals();
});

describe('recordPlaybackSignal', () => {
  it('treats a full listen as a completion, not a skip', () => {
    recordPlaybackSignal(track('1'), 195);
    expect(getTrackScore(track('1'))).toBeGreaterThan(0);
  });

  it('treats a play under the skip threshold as a skip', () => {
    recordPlaybackSignal(track('1'), 2);
    recordPlaybackSignal(track('1'), 2);
    expect(getTrackScore(track('1'))).toBeLessThan(0);
  });

  it('builds negative artist affinity from repeated skips', () => {
    recordPlaybackSignal(track('1', { artistIds: ['a9'] }), 2);
    recordPlaybackSignal(track('2', { artistIds: ['a9'] }), 3);
    expect(getArtistAffinity('a9')).toBeLessThan(0);
    expect(getDislikedArtistIds()).toContain('a9');
  });

  it('builds positive artist affinity from full listens', () => {
    recordPlaybackSignal(track('1', { artistIds: ['a9'] }), 190);
    recordPlaybackSignal(track('2', { artistIds: ['a9'] }), 190);
    expect(getArtistAffinity('a9')).toBeGreaterThan(0);
    expect(getTopArtistIds()).toContain('a9');
  });

  it('falls back to a name-keyed pseudo-id when a track has no artist id', () => {
    recordPlaybackSignal(track('1', { artistIds: [], artists: ['No Id Artist'] }), 190);
    recordPlaybackSignal(track('2', { artistIds: [], artists: ['No Id Artist'] }), 190);
    expect(getTopArtistIds()).toContain('name:no id artist');
  });
});

describe('filterRecommendations', () => {
  it('drops tracks by disliked artists and frequently-skipped tracks', () => {
    recordPlaybackSignal(track('skip-me', { artistIds: ['a1'] }), 2);
    recordPlaybackSignal(track('skip-me', { artistIds: ['a1'] }), 3);
    recordPlaybackSignal(track('bad-artist', { artistIds: ['a2'] }), 2);
    recordPlaybackSignal(track('bad-artist-2', { artistIds: ['a2'] }), 3);

    const candidates = [
      track('skip-me', { artistIds: ['a1'] }),
      track('bad-artist-3', { artistIds: ['a2'] }),
      track('fresh', { artistIds: ['a3'] }),
    ];
    const filtered = filterRecommendations(candidates);
    const ids = filtered.map((t) => t.provider_id);
    expect(ids).not.toContain('skip-me');
    expect(ids).not.toContain('bad-artist-3');
    expect(ids).toContain('fresh');
  });

  it('keeps everything when there is no listening history yet', () => {
    const candidates = [track('1'), track('2')];
    expect(filterRecommendations(candidates)).toHaveLength(2);
  });
});

describe('rankRecommendations', () => {
  it('surfaces tracks by known-affinity artists first', () => {
    recordPlaybackSignal(track('seed-1', { artistIds: ['loved'] }), 190);
    recordPlaybackSignal(track('seed-2', { artistIds: ['loved'] }), 190);

    const ranked = rankRecommendations([
      track('unknown', { artistIds: ['stranger'] }),
      track('by-loved', { artistIds: ['loved'] }),
    ]);
    expect(ranked[0].provider_id).toBe('by-loved');
  });
});
