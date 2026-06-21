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

  it('resolvePlayerUiQuality follows delivered codec', () => {
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'HIGH' },
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      qualitiesReady: true,
    })).toBe('HIGH');
    expect(resolvePlayerUiQuality({
      deliveredStream: { tier: 'LOSSLESS' },
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      qualitiesReady: true,
    })).toBe('LOSSLESS');
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
});
