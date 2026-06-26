import { describe, expect, it } from 'vitest';
import { isLandingCinemaToggleKey, isTypingTarget } from './landingCinemaKeys.js';

describe('isLandingCinemaToggleKey', () => {
  it('accepts Shift+V on English layout', () => {
    expect(isLandingCinemaToggleKey({
      code: 'KeyV',
      key: 'V',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
    })).toBe(true);
  });

  it('accepts Shift+V on Russian layout (Cyrillic key label)', () => {
    expect(isLandingCinemaToggleKey({
      code: 'KeyV',
      key: 'М',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
    })).toBe(true);
  });

  it('rejects plain V without shift', () => {
    expect(isLandingCinemaToggleKey({
      code: 'KeyV',
      key: 'v',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
    })).toBe(false);
  });

  it('rejects key repeat', () => {
    expect(isLandingCinemaToggleKey({
      code: 'KeyV',
      key: 'V',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: true,
    })).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('blocks inputs', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
  });
});
