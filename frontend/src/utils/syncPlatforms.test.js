import { describe, expect, it } from 'vitest';
import {
  detectPlatformFromUrl,
  getSyncPlatform,
  isTransferUrl,
  placeholderForPlatform,
  SYNC_PLATFORMS,
} from './syncPlatforms.js';

describe('syncPlatforms', () => {
  it('lists all platforms as available', () => {
    expect(SYNC_PLATFORMS.every((p) => !p.soon)).toBe(true);
  });

  it('detects platform from URL', () => {
    expect(detectPlatformFromUrl('https://open.spotify.com/playlist/abc')).toBe('spotify');
    expect(detectPlatformFromUrl('https://tidal.com/browse/playlist/x')).toBe('tidal');
    expect(detectPlatformFromUrl('https://music.yandex.ru/album/1')).toBe('yandex');
  });

  it('validates URL for selected platform', () => {
    expect(isTransferUrl('https://open.spotify.com/playlist/abc', 'spotify')).toBe(true);
    expect(isTransferUrl('https://tidal.com/browse/playlist/x', 'spotify')).toBe(false);
    expect(isTransferUrl('https://tidal.com/browse/playlist/x')).toBe(true);
  });

  it('returns platform metadata', () => {
    expect(getSyncPlatform('tidal')?.soon).toBe(false);
    expect(getSyncPlatform('spotify')?.name).toBe('Spotify');
    expect(placeholderForPlatform('deezer')).toContain('deezer.com');
  });
});
