import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  musicalToCamelot,
  persistFeatureEntry,
  getLibraryTrackFeatures,
  getCachedTrackFeatures,
  clearFailedFeatureCache,
  loadPersistedFeatures,
  seedFeaturesFromLibraryRow,
} from './trackFeatures.js';

function mockLocalStorage() {
  const store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  });
}

describe('trackFeatures', () => {
  beforeEach(() => {
    mockLocalStorage();
    loadPersistedFeatures();
  });

  it('maps musical key to camelot', () => {
    expect(musicalToCamelot('Cm')).toBe('5A');
    expect(musicalToCamelot('8A')).toBe('8A');
  });

  it('persists and reads library features', () => {
    persistFeatureEntry('99', { bpm: 124, musicalKey: 'Am', camelotKey: '1A', analyzed: true });
    expect(getLibraryTrackFeatures({ provider_id: '99' })).toMatchObject({
      bpm: 124,
      camelotKey: '1A',
    });
  });

  it('seeds from API row', () => {
    seedFeaturesFromLibraryRow({
      provider_id: '42',
      bpm: 130,
      camelot_key: '10B',
      musical_key: 'D',
    });
    expect(getLibraryTrackFeatures({ provider_id: '42' }).camelotKey).toBe('10B');
  });

  it('getCachedTrackFeatures ignores non-success entries', () => {
    expect(getCachedTrackFeatures({ provider_id: 'no-such' })).toBeNull();
    clearFailedFeatureCache('no-such');
    persistFeatureEntry('88', { bpm: 128, musicalKey: 'Am', camelotKey: '1A', analyzed: true });
    expect(getCachedTrackFeatures({ provider_id: '88' })?.bpm).toBe(128);
  });
});
