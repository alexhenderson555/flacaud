import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearActiveAnalyzerJob,
  loadActiveAnalyzerJob,
  saveActiveAnalyzerJob,
} from './analyzerJobStorage';

describe('analyzerJobStorage', () => {
  const store = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    });
  });

  it('saves and loads active job for matching url', () => {
    saveActiveAnalyzerJob({ jobId: 'abc123', url: 'https://youtu.be/x' });
    expect(loadActiveAnalyzerJob('https://youtu.be/x')).toEqual(expect.objectContaining({
      jobId: 'abc123',
      url: 'https://youtu.be/x',
    }));
    expect(loadActiveAnalyzerJob('https://youtu.be/other')).toBeNull();
  });

  it('clears active job', () => {
    saveActiveAnalyzerJob({ jobId: 'abc123', url: 'https://youtu.be/x' });
    clearActiveAnalyzerJob('https://youtu.be/x');
    expect(loadActiveAnalyzerJob('https://youtu.be/x')).toBeNull();
  });
});
