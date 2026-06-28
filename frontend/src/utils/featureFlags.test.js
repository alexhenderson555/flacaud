import { describe, expect, it, beforeEach } from 'vitest';

// Tests run in the `node` environment (no jsdom), so provide a tiny in-memory
// localStorage for the flag store.
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

const { isFeatureEnabled, setFeatureFlag, allFeatureFlags } = await import('./featureFlags');

describe('featureFlags', () => {
  beforeEach(() => localStorage.clear());

  it('returns the prod default (off) when there is no override', () => {
    expect(isFeatureEnabled('aiDj')).toBe(false);
    expect(isFeatureEnabled('unknownFlag')).toBe(false);
  });

  it('honors an override and persists it', () => {
    setFeatureFlag('aiDj', true);
    expect(isFeatureEnabled('aiDj')).toBe(true);
    setFeatureFlag('aiDj', false);
    expect(isFeatureEnabled('aiDj')).toBe(false);
  });

  it('merges defaults with overrides in allFeatureFlags', () => {
    setFeatureFlag('continuousMix', true);
    const flags = allFeatureFlags();
    expect(flags.continuousMix).toBe(true);
    expect(flags.aiDj).toBe(false);
  });
});
