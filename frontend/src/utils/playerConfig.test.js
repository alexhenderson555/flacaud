import { describe, it, expect } from 'vitest';
import { CROSSFADE_SEC } from './playerConfig.js';

describe('playerConfig', () => {
  it('crossfade is between 5 and 7 seconds', () => {
    expect(CROSSFADE_SEC).toBeGreaterThanOrEqual(5);
    expect(CROSSFADE_SEC).toBeLessThanOrEqual(7);
  });
});
