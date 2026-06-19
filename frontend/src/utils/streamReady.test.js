import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitForLosslessStreamReady } from './streamReady.js';

describe('waitForLosslessStreamReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns true for blob urls', async () => {
    await expect(waitForLosslessStreamReady('blob:http://x')).resolves.toBe(true);
  });

  it('returns true on 206', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 206,
      body: { cancel: vi.fn() },
    });
    await expect(waitForLosslessStreamReady('/api/stream/tidal/1?quality=LOSSLESS')).resolves.toBe(true);
  });

  it('retries 503 then succeeds', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 206, body: { cancel: vi.fn() } });
    const p = waitForLosslessStreamReady('/api/stream/tidal/1', { intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(true);
  });
});
