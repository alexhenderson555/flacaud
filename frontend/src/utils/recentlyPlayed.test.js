import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushRecentlyPlayed, readRecentlyPlayed, clearRecentlyPlayed } from './recentlyPlayed';

describe('recentlyPlayed', () => {
  const store = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    });
    clearRecentlyPlayed();
  });

  it('dedupes and keeps newest first', () => {
    const a = { provider_id: '1', title: 'A', artists: ['X'] };
    const b = { provider_id: '2', title: 'B', artists: ['Y'] };
    pushRecentlyPlayed(a);
    pushRecentlyPlayed(b);
    pushRecentlyPlayed(a);
    const list = readRecentlyPlayed();
    expect(list).toHaveLength(2);
    expect(list[0].provider_id).toBe('1');
    expect(list[1].provider_id).toBe('2');
  });
});
