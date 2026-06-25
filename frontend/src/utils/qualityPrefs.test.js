import { describe, it, expect } from 'vitest';
import {
  pickBestAvailableQuality,
  lowerQualityTier,
  qualityBadgeLabel,
  streamBadgeLabel,
  clampQualityToPlan,
  pickQualityForPlan,
  isQualityAllowedForPlan,
  isPlaybackQualityAvailable,
  resolveMaxTrackQuality,
  resolvePlayerUiQuality,
  isPausedMidPlayback,
  qualityPreferenceFallbackToast,
  shouldAnnounceQualityFallback,
} from './qualityPrefs.js';

describe('qualityPrefs', () => {
  it('falls back from HI_RES to LOSSLESS when MAX unavailable', () => {
    const available = ['LOW', 'HIGH', 'LOSSLESS'];
    expect(pickBestAvailableQuality('HI_RES', available)).toBe('LOSSLESS');
  });

  it('keeps wanted quality when available', () => {
    expect(pickBestAvailableQuality('HI_RES', ['LOW', 'HI_RES'])).toBe('HI_RES');
  });

  it('lowers tier on stream error', () => {
    expect(lowerQualityTier('HI_RES', ['LOW', 'HIGH', 'LOSSLESS'])).toBe('LOSSLESS');
    expect(lowerQualityTier('LOSSLESS', ['LOW', 'HIGH', 'LOSSLESS'])).toBe('HIGH');
  });

  it('detects paused mid-track playback', () => {
    expect(isPausedMidPlayback(null)).toBe(false);
    expect(isPausedMidPlayback({ paused: false, currentTime: 10, src: 'x' })).toBe(false);
    expect(isPausedMidPlayback({ paused: true, currentTime: 0, src: 'x' })).toBe(false);
    expect(isPausedMidPlayback({ paused: true, currentTime: 5, src: 'http://x/a' })).toBe(true);
  });

  it('maps badge labels to two UI tiers', () => {
    expect(qualityBadgeLabel('HI_RES_LOSSLESS')).toBe('Lossless');
    expect(qualityBadgeLabel('HI_RES')).toBe('Lossless');
    expect(qualityBadgeLabel('LOSSLESS')).toBe('Lossless');
    expect(qualityBadgeLabel('HIGH')).toBe('320k');
  });

  it('streamBadgeLabel tolerates null delivered (pre-stream badge)', () => {
    expect(streamBadgeLabel(null, 'LOSSLESS')).toBe('Lossless');
    expect(streamBadgeLabel(null, 'HIGH')).toBe('320k');
  });

  it('resolveMaxTrackQuality ignores invalid LOW ceiling', () => {
    expect(resolveMaxTrackQuality('LOW', ['HIGH', 'LOSSLESS'])).toBe('LOSSLESS');
  });

  it('allows LOSSLESS on pro plan when HI_RES is in probe list', () => {
    expect(isPlaybackQualityAvailable(
      'LOSSLESS',
      ['HIGH', 'LOSSLESS'],
      'LOSSLESS',
      'pro',
      { lossless: { available: true, hires_only: false } },
    )).toBe(true);
  });

  it('resolvePlayerUiQuality follows delivered codec when stable', () => {
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'HIGH' },
      streamQuality: 'HIGH',
      playbackQuality: 'HIGH',
      qualitiesReady: true,
    })).toBe('HIGH');
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'LOSSLESS' },
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      qualitiesReady: true,
    })).toBe('LOSSLESS');
  });

  it('resolvePlayerUiQuality prefers requested tier while switching', () => {
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'HIGH' },
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      qualitiesReady: true,
    })).toBe('LOSSLESS');
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'LOSSLESS' },
      streamQuality: 'HIGH',
      playbackQuality: 'HIGH',
      qualitiesReady: true,
      isLoading: true,
    })).toBe('HIGH');
  });

  it('clamps free plan to 320k (HIGH)', () => {
    expect(clampQualityToPlan('LOSSLESS', 'free')).toBe('HIGH');
    expect(isQualityAllowedForPlan('LOSSLESS', 'free')).toBe(false);
    expect(isQualityAllowedForPlan('HIGH', 'free')).toBe(true);
    expect(pickQualityForPlan('LOSSLESS', ['LOW', 'HIGH', 'LOSSLESS'], 'free')).toBe('HIGH');
  });

  it('allows lifetime MAX when track supports it', () => {
    expect(pickQualityForPlan('HI_RES', ['LOW', 'HI_RES'], 'lifetime')).toBe('HI_RES');
  });

  it('qualityPreferenceFallbackToast never returns empty without dict', () => {
    const msg = qualityPreferenceFallbackToast('en', {
      planBlocked: false,
      tidalCatalogOnly: false,
      pref: 'LOSSLESS',
      effective: 'HIGH',
    });
    expect(msg.trim().length).toBeGreaterThan(0);
  });

  it('shouldAnnounceQualityFallback skips 320k and radio suppression', () => {
    expect(shouldAnnounceQualityFallback({ effective: 'HIGH' })).toBe(false);
    expect(shouldAnnounceQualityFallback({ lower: 'HIGH' })).toBe(false);
    expect(shouldAnnounceQualityFallback({ effective: 'LOSSLESS', suppressed: true })).toBe(false);
    expect(shouldAnnounceQualityFallback({ effective: 'LOSSLESS' })).toBe(true);
  });
});
