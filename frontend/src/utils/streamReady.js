/** Poll until lossless stream responds (server finished DASH merge). */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForLosslessStreamReady(
  streamUrl,
  { timeoutMs = 120_000, intervalMs = 450, signal } = {},
) {
  if (!streamUrl || streamUrl.startsWith('blob:')) return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    try {
      const res = await fetch(streamUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal,
      });
      if (res.status === 206 || res.status === 200) {
        try {
          res.body?.cancel?.();
        } catch {
          /* ignore */
        }
        return true;
      }
      if (res.status !== 503 && res.status !== 504) return false;
    } catch (err) {
      if (err?.name === 'AbortError') return false;
    }
    await sleep(intervalMs);
  }
  return false;
}
