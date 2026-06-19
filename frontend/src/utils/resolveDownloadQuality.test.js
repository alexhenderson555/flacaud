import { describe, expect, it } from 'vitest';
import {
  downloadWantedTier,
  pickDownloadQualityFromProbe,
  resolvePlayingTrackDownloadQuality,
} from './resolveDownloadQuality';

describe('downloadWantedTier', () => {
  it('uses manual default from profile', () => {
    expect(downloadWantedTier({
      autoPlaybackQuality: false,
      defaultPlaybackQuality: 'LOSSLESS',
      effectivePlan: 'pro',
    })).toBe('LOSSLESS');
  });

  it('uses plan max when auto quality is on', () => {
    expect(downloadWantedTier({
      autoPlaybackQuality: true,
      defaultPlaybackQuality: 'LOSSLESS',
      effectivePlan: 'pro',
    })).toBe('HI_RES');
  });

  it('clamps manual default to free plan', () => {
    expect(downloadWantedTier({
      autoPlaybackQuality: false,
      defaultPlaybackQuality: 'HI_RES',
      effectivePlan: 'free',
    })).toBe('HIGH');
  });
});

describe('resolvePlayingTrackDownloadQuality', () => {
  it('uses streamQuality when probe is ready', () => {
    expect(resolvePlayingTrackDownloadQuality({
      streamQuality: 'LOSSLESS',
      playbackQuality: 'HI_RES',
      availableQualities: ['HIGH', 'LOSSLESS'],
      downloadableQualities: ['HIGH', 'LOSSLESS'],
      qualitiesReady: true,
      effectivePlan: 'pro',
    })).toBe('LOSSLESS');
  });

  it('falls back to 320k when FLAC is UI-only (not downloadable)', () => {
    expect(resolvePlayingTrackDownloadQuality({
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      availableQualities: ['HIGH', 'LOSSLESS'],
      downloadableQualities: ['HIGH'],
      qualitiesReady: true,
      effectivePlan: 'pro',
    })).toBe('HIGH');
  });

  it('downloads MAX when playing FLAC on hi-res-only track', () => {
    expect(resolvePlayingTrackDownloadQuality({
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      probeData: {
        available: ['HIGH', 'LOSSLESS', 'HI_RES'],
        downloadable: ['HIGH', 'HI_RES'],
        max_quality: 'HI_RES',
      },
      qualitiesReady: true,
      effectivePlan: 'pro',
    })).toBe('HI_RES');
  });

  it('uses probe downloadable list instead of UI-only FLAC', () => {
    expect(resolvePlayingTrackDownloadQuality({
      streamQuality: 'LOSSLESS',
      playbackQuality: 'LOSSLESS',
      probeData: {
        available: ['HIGH', 'LOSSLESS'],
        downloadable: ['HIGH'],
        max_quality: 'LOSSLESS',
      },
      qualitiesReady: true,
      effectivePlan: 'pro',
    })).toBe('HIGH');
  });
});

describe('pickDownloadQualityFromProbe', () => {
  const probeLosslessOnly = {
    available: ['HIGH', 'LOSSLESS'],
    downloadable: ['HIGH', 'LOSSLESS'],
    max_quality: 'LOSSLESS',
    actual: { LOSSLESS: 'LOSSLESS', HIGH: 'HIGH' },
  };

  it('falls back MAX to FLAC when track has no hi-res', () => {
    expect(pickDownloadQualityFromProbe(
      'HI_RES',
      probeLosslessOnly,
      null,
      'pro',
      { autoPlaybackQuality: false },
    )).toBe('LOSSLESS');
  });

  it('falls back to 320k when LOSSLESS is catalog-only', () => {
    expect(pickDownloadQualityFromProbe(
      'LOSSLESS',
      {
        available: ['HIGH', 'LOSSLESS'],
        downloadable: ['HIGH'],
        max_quality: 'LOSSLESS',
      },
      null,
      'pro',
      { autoPlaybackQuality: false },
    )).toBe('HIGH');
  });

  it('prefers MAX over 320k when FLAC asked but only MAX is verified', () => {
    expect(pickDownloadQualityFromProbe(
      'LOSSLESS',
      {
        available: ['HIGH', 'LOSSLESS', 'HI_RES'],
        downloadable: ['HIGH', 'HI_RES'],
        max_quality: 'HI_RES',
      },
      null,
      'pro',
      { autoPlaybackQuality: false },
    )).toBe('HI_RES');
  });

  it('keeps MAX when track supports it', () => {
    expect(pickDownloadQualityFromProbe(
      'HI_RES',
      {
        available: ['HIGH', 'LOSSLESS', 'HI_RES'],
        downloadable: ['HIGH', 'LOSSLESS', 'HI_RES'],
        max_quality: 'HI_RES',
      },
      null,
      'pro',
      { autoPlaybackQuality: false },
    )).toBe('HI_RES');
  });

  it('auto mode picks best tier for track within plan', () => {
    expect(pickDownloadQualityFromProbe(
      'HI_RES',
      probeLosslessOnly,
      null,
      'pro',
      { autoPlaybackQuality: true },
    )).toBe('LOSSLESS');
  });
});
