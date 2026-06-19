import { describe, it, expect } from 'vitest';
import { CROSSFADE_SEC, FEATURE_CROSSFADE } from './playerConfig.js';

describe('playerConfig', () => {
  it('crossfade is off by default or 5–7s when enabled', () => {
    if (FEATURE_CROSSFADE) {
      expect(CROSSFADE_SEC).toBeGreaterThanOrEqual(5);
      expect(CROSSFADE_SEC).toBeLessThanOrEqual(7);
    } else {
      expect(CROSSFADE_SEC).toBe(0);
    }
  });
});
