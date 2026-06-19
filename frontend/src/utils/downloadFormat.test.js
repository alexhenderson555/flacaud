import { describe, expect, it } from 'vitest';
import { extensionForQuality, extensionFromResponse } from './downloadFormat';

describe('extensionForQuality', () => {
  it('maps lossless tiers to flac', () => {
    expect(extensionForQuality('LOSSLESS')).toBe('flac');
    expect(extensionForQuality('HI_RES')).toBe('flac');
  });

  it('maps 320k to m4a (AAC container)', () => {
    expect(extensionForQuality('HIGH')).toBe('m4a');
  });

  it('prefers blob mime when present', () => {
    expect(extensionForQuality('HIGH', 'audio/flac')).toBe('flac');
    expect(extensionForQuality('LOSSLESS', 'audio/mp4')).toBe('m4a');
  });
});

describe('extensionFromResponse', () => {
  it('uses content-disposition filename', () => {
    expect(extensionFromResponse('attachment; filename="Artist - Song.m4a"', '')).toBe('m4a');
  });

  it('uses mime when filename missing', () => {
    expect(extensionFromResponse(null, 'audio/mp4')).toBe('m4a');
  });

  it('does not invent flac from job tier', () => {
    expect(extensionFromResponse(null, '', 'm4a')).toBe('m4a');
  });
});
