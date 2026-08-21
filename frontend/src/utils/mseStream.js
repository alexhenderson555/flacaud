/**
 * Experimental MSE-based progressive playback for LOSSLESS/HI_RES DASH tracks
 * (behind the `mseLossless` feature flag — see featureFlags.js).
 *
 * Feeds SourceBuffer.appendBuffer() from a chunked fetch() of raw DASH
 * init+media segments (`/api/stream/{provider}/{track_id}/mse`), so playback
 * can start as soon as enough is buffered instead of waiting for the
 * server's full download+remux — see streaming.py's
 * `dash_stream_bytes_needed` docstring for why that wait exists on the
 * normal (non-MSE) path, and why serving the pre-remux file progressively
 * through *that* path was tried before and reverted. This bypasses that
 * path entirely instead of modifying it.
 *
 * Any failure here must fall back to the existing waitForLosslessStreamReady
 * flow in usePlaybackQuality — this module never throws to signal failure,
 * it returns `null` so the caller can fall back silently.
 */

export function mseSupported(mimeType) {
  return typeof window !== 'undefined'
    && 'MediaSource' in window
    && typeof MediaSource.isTypeSupported === 'function'
    && MediaSource.isTypeSupported(mimeType);
}

/**
 * Starts feeding an MSE MediaSource from `url`. Resolves to `{ blobUrl, abort }`
 * once the first chunk is appended (caller then sets `<audio>.src = blobUrl`),
 * or `null` if MSE can't be used for this stream at all.
 *
 * The codec MIME type isn't guessed client-side — it's read from the actual
 * `Content-Type` the server returns (derived server-side from the DASH
 * manifest's own codecs attribute), so support is checked against the real
 * codec rather than an assumption about what LOSSLESS/HI_RES always is.
 */
export async function startMseStream(url, { signal, trackDurationSec } = {}) {
  if (typeof window === 'undefined' || !('MediaSource' in window)) return null;

  let response;
  try {
    response = await fetch(url, { signal });
  } catch {
    return null;
  }
  if (!response.ok || !response.body) {
    try { response.body?.cancel(); } catch { /* noop */ }
    return null;
  }

  const mimeType = response.headers.get('content-type') || 'audio/mp4';
  if (!mseSupported(mimeType)) {
    try { response.body.cancel(); } catch { /* noop */ }
    return null;
  }

  const mediaSource = new MediaSource();
  const blobUrl = URL.createObjectURL(mediaSource);
  let aborted = false;
  let sourceBuffer = null;

  const cleanup = () => {
    try { URL.revokeObjectURL(blobUrl); } catch { /* noop */ }
  };

  const opened = new Promise((resolve) => {
    mediaSource.addEventListener('sourceopen', () => resolve(true), { once: true });
  });

  const didOpen = await Promise.race([
    opened,
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!didOpen || aborted) {
    cleanup();
    try { response.body.cancel(); } catch { /* noop */ }
    return null;
  }

  try {
    sourceBuffer = mediaSource.addSourceBuffer(mimeType);
    // Real duration is already known from track metadata — never rely on
    // the growing fMP4's own (unreliable while incomplete) moov duration.
    if (trackDurationSec > 0) {
      try { mediaSource.duration = trackDurationSec; } catch { /* noop */ }
    }
  } catch {
    cleanup();
    try { response.body.cancel(); } catch { /* noop */ }
    return null;
  }

  const reader = response.body.getReader();

  const appendChunk = (chunk) => new Promise((resolve, reject) => {
    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      sourceBuffer.removeEventListener('error', onSbError);
      resolve();
    };
    const onSbError = (e) => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      sourceBuffer.removeEventListener('error', onSbError);
      reject(e);
    };
    sourceBuffer.addEventListener('updateend', onUpdateEnd);
    sourceBuffer.addEventListener('error', onSbError);
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch (e) {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      sourceBuffer.removeEventListener('error', onSbError);
      reject(e);
    }
  });

  const feedLoop = (async () => {
    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (aborted || mediaSource.readyState === 'closed') break;
        await appendChunk(value);
      }
      if (!aborted && mediaSource.readyState === 'open') {
        mediaSource.endOfStream();
      }
    } catch {
      // This loop has no channel back into usePlaybackQuality once the src
      // has already been handed to the <audio> element — a genuine
      // mid-stream failure surfaces through the element's own error/stall
      // handling (its existing handleStreamError retry path), same as any
      // other network hiccup on a plain streamed src.
      try {
        if (mediaSource.readyState === 'open') mediaSource.endOfStream('network');
      } catch { /* noop */ }
    } finally {
      try { reader.cancel(); } catch { /* noop */ }
    }
  })();

  return {
    blobUrl,
    abort: () => {
      aborted = true;
      try { reader.cancel(); } catch { /* noop */ }
      try { if (mediaSource.readyState === 'open') mediaSource.endOfStream(); } catch { /* noop */ }
      cleanup();
      void feedLoop;
    },
  };
}
