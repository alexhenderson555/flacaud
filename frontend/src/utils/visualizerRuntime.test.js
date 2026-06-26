import { describe, expect, it } from 'vitest';
import {
  visualizerAudioIsActive,
  visualizerPeakLevel,
  visualizerShouldAnimate,
} from './visualizerRuntime.js';

describe('visualizerRuntime', () => {
  it('detects active audio from element state', () => {
    expect(visualizerAudioIsActive({ paused: false, ended: false })).toBe(true);
    expect(visualizerAudioIsActive({ paused: true, ended: false })).toBe(false);
    expect(visualizerAudioIsActive(null)).toBe(false);
  });

  it('does not animate when tab is hidden', () => {
    expect(visualizerShouldAnimate({
      visibilityState: 'hidden',
      audioEl: { paused: false, ended: false },
    })).toBe(false);
  });

  it('animates when tab visible and audio plays', () => {
    expect(visualizerShouldAnimate({
      visibilityState: 'visible',
      audioEl: { paused: false, ended: false },
    })).toBe(true);
  });

  it('measures peak bar level', () => {
    expect(visualizerPeakLevel(new Float32Array([1, 40, 12]))).toBe(40);
    expect(visualizerPeakLevel(null)).toBe(0);
  });
});
