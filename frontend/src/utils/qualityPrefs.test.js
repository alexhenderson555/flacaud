import { describe, it, expect } from 'vitest';
import {
  pickBestAvailableQuality,
  lowerQualityTier,
  qualityBadgeLabel,
  clampQualityToPlan,
  pickQualityForPlan,
  isQualityAllowedForPlan,
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

  it('maps badge labels', () => {
    expect(qualityBadgeLabel('HI_RES_LOSSLESS')).toBe('MAX');
    expect(qualityBadgeLabel('LOSSLESS')).toBe('Lossless');
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
