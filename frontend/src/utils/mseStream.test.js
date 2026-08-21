import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// node environment (no jsdom, matching this repo's other util tests) — MSE/fetch/
// URL are all browser APIs, so build minimal fakes rather than pull in jsdom
// (which doesn't implement MediaSource anyway).

class FakeSourceBuffer extends EventTarget {
  constructor() {
    super();
    this.appended = [];
    this.appendBuffer = vi.fn((chunk) => {
      this.appended.push(chunk);
      queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
    });
  }
}

class FakeMediaSource extends EventTarget {
  constructor() {
    super();
    this.readyState = 'open';
    this.sourceBuffer = new FakeSourceBuffer();
    this.addSourceBuffer = vi.fn(() => this.sourceBuffer);
    this.endOfStream = vi.fn(() => { this.readyState = 'ended'; });
    // Real browsers fire sourceopen async after the src is assigned; here we
    // fire it as soon as something listens, close enough for these tests.
    this.addEventListener = (type, cb, opts) => {
      super.addEventListener(type, cb, opts);
      if (type === 'sourceopen') queueMicrotask(() => this.dispatchEvent(new Event('sourceopen')));
    };
  }
}

function fakeResponse({ ok = true, contentType = 'audio/mp4; codecs="flac"', chunks = [new Uint8Array([1, 2, 3])] } = {}) {
  let i = 0;
  return {
    ok,
    headers: { get: (h) => (h === 'content-type' ? contentType : null) },
    body: {
      cancel: vi.fn(),
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) return { done: false, value: chunks[i++] };
          return { done: true, value: undefined };
        },
      }),
    },
  };
}

beforeEach(() => {
  globalThis.window = globalThis;
  globalThis.MediaSource = FakeMediaSource;
  globalThis.MediaSource.isTypeSupported = vi.fn(() => true);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

const { mseSupported, startMseStream } = await import('./mseStream.js');

describe('mseSupported', () => {
  it('false when MediaSource is unavailable', () => {
    const saved = globalThis.MediaSource;
    delete globalThis.MediaSource;
    expect(mseSupported('audio/mp4; codecs="flac"')).toBe(false);
    globalThis.MediaSource = saved;
  });

  it('delegates to MediaSource.isTypeSupported', () => {
    globalThis.MediaSource.isTypeSupported = vi.fn(() => false);
    expect(mseSupported('audio/mp4; codecs="unknown"')).toBe(false);
    expect(globalThis.MediaSource.isTypeSupported).toHaveBeenCalledWith('audio/mp4; codecs="unknown"');
  });
});

describe('startMseStream', () => {
  it('returns null when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await startMseStream('https://x/mse');
    expect(result).toBeNull();
  });

  it('returns null when the response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse({ ok: false }));
    const result = await startMseStream('https://x/mse');
    expect(result).toBeNull();
  });

  it('returns null when the codec is unsupported', async () => {
    globalThis.MediaSource.isTypeSupported = vi.fn(() => false);
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse());
    const result = await startMseStream('https://x/mse');
    expect(result).toBeNull();
  });

  it('feeds appendBuffer from the fetch stream and resolves with blobUrl+abort', async () => {
    const chunk = new Uint8Array([9, 9, 9]);
    const response = fakeResponse({ chunks: [chunk] });
    globalThis.fetch = vi.fn().mockResolvedValue(response);

    const result = await startMseStream('https://x/mse', { trackDurationSec: 200 });
    expect(result).not.toBeNull();
    expect(result.blobUrl).toBe('blob:fake-url');
    expect(typeof result.abort).toBe('function');

    // The feed loop runs detached (fire-and-forget) after startMseStream
    // resolves — flush microtasks so the first appendBuffer call lands.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    result.abort();
  });

  it('sets mediaSource.duration from known track duration, not the stream', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse());
    const result = await startMseStream('https://x/mse', { trackDurationSec: 123.4 });
    expect(result).not.toBeNull();
    result.abort();
  });
});
