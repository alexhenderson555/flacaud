import { describe, expect, it, vi } from 'vitest';
import {
  mergeVibeRadioTracks,
  tagVibeRadioTracks,
  VIBE_RADIO_ORIGIN,
  fetchVibeRadioBatch,
} from './vibeRadio';

describe('vibeRadio', () => {
  it('tags tracks with vibe-radio origin', () => {
    const tagged = tagVibeRadioTracks([{ provider_id: '1', title: 'A' }]);
    expect(tagged[0].__queue_origin).toBe(VIBE_RADIO_ORIGIN);
  });

  it('merges without duplicates', () => {
    const existing = tagVibeRadioTracks([
      { provider_id: '1', title: 'A' },
      { provider_id: '2', title: 'B' },
    ]);
    const merged = mergeVibeRadioTracks(existing, [
      { provider_id: '2', title: 'B dup' },
      { provider_id: '3', title: 'C' },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.map((tr) => tr.provider_id)).toEqual(['1', '2', '3']);
    expect(merged.every((tr) => tr.__queue_origin === VIBE_RADIO_ORIGIN)).toBe(true);
  });

  it('fetchVibeRadioBatch passes exclude to API', async () => {
    const apiGetJson = vi.fn().mockResolvedValue({
      tracks: [{ provider_id: '9', title: 'Nine' }],
    });
    await fetchVibeRadioBatch({
      apiGetJson,
      lang: 'en',
      excludeIds: ['1', '2'],
      limit: 10,
    });
    expect(apiGetJson).toHaveBeenCalledWith(
      '/api/recommendations?limit=10&refresh=1&exclude=1%2C2',
      { auth: true, lang: 'en' },
    );
  });
});
