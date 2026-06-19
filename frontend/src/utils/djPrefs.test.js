import { describe, it, expect } from 'vitest';
import { planAllowsDjFeatures, canUseDjFeatures } from './djPrefs';

describe('djPrefs', () => {
  it('allows pro and lifetime only', () => {
    expect(planAllowsDjFeatures('pro')).toBe(true);
    expect(planAllowsDjFeatures('lifetime')).toBe(true);
    expect(planAllowsDjFeatures('basic')).toBe(false);
    expect(planAllowsDjFeatures('free')).toBe(false);
  });

  it('requires plan and user toggle', () => {
    expect(canUseDjFeatures('pro', true)).toBe(true);
    expect(canUseDjFeatures('pro', false)).toBe(false);
    expect(canUseDjFeatures('free', true)).toBe(false);
  });
});
