import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isChunkLoadError,
  reloadForStaleChunks,
  importRouteModule,
  CHUNK_RELOAD_KEY,
} from './chunkRecovery';

describe('isChunkLoadError', () => {
  it('detects Vite dynamic import failures', () => {
    expect(isChunkLoadError(new TypeError(
      'Failed to fetch dynamically imported module: https://flacaud.ru/assets/Account-DUX3P7Nr.js',
    ))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('network error'))).toBe(false);
  });
});

describe('reloadForStaleChunks', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      clear: () => { store.clear(); },
    });
    vi.stubGlobal('location', { reload: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reloads only once per session', () => {
    expect(reloadForStaleChunks()).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(reloadForStaleChunks()).toBe(false);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });
});

describe('importRouteModule', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      clear: () => { store.delete(CHUNK_RELOAD_KEY); },
    });
    vi.stubGlobal('location', { reload: vi.fn() });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns module after a transient failure', async () => {
    let calls = 0;
    const importer = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
      }
      return { default: () => null };
    });

    const promise = importRouteModule(importer);
    await vi.runAllTimersAsync();
    const mod = await promise;
    expect(mod.default).toBeTypeOf('function');
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
