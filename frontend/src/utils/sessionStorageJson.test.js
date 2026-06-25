import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessionJson } from './sessionStorageJson';

function stubSessionStorage() {
  const store = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
}

describe('readSessionJson', () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns fallback when missing', () => {
    expect(readSessionJson('missing', null)).toBe(null);
  });

  it('parses valid json', () => {
    sessionStorage.setItem('k', JSON.stringify([1, 2]));
    expect(readSessionJson('k', null)).toEqual([1, 2]);
  });

  it('clears corrupt json', () => {
    sessionStorage.setItem('k', '{bad');
    expect(readSessionJson('k', null)).toBe(null);
    expect(sessionStorage.getItem('k')).toBe(null);
  });
});
