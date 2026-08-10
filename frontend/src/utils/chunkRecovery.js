/** Detect stale Vite/Rollup lazy chunks after a deploy (404 on /assets/*.js). */

export const CHUNK_RELOAD_KEY = 'flacaud-chunk-reload';

export function isChunkLoadError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  if (
    msg.includes('failed to fetch dynamically imported module')
    || msg.includes('loading chunk')
    || msg.includes('loading css chunk')
    || msg.includes('importing a module script failed')
    || msg.includes('error loading dynamically imported module')
    || msg.includes('dynamically imported module')
  ) {
    return true;
  }
  // A chunk that gets truncated mid-transfer (CDN/edge cuts the response
  // short, but the browser still got a 200 and *some* valid JS) doesn't fail
  // to fetch at all -- it executes whatever prefix arrived, defines some but
  // not all of its symbols, and blows up downstream the first time something
  // references a symbol that never got defined. That surfaces as a generic
  // TypeError/SyntaxError, not one of the "failed to fetch" messages above,
  // so it needs its own (necessarily broader, but still one-shot-guarded by
  // reloadForStaleChunks) detection to get the same auto-reload treatment.
  return (
    err instanceof TypeError && (
      msg.endsWith('is not a function') || msg.endsWith('is not a constructor')
    )
  ) || (
    // Real "is not defined" errors are ReferenceErrors, not TypeErrors --
    // excluding window/document keeps this from swallowing a genuinely
    // missing-global bug in third-party/browser-extension code.
    err instanceof ReferenceError
    && msg.includes('is not defined')
    && !msg.includes('window')
    && !msg.includes('document')
  ) || (
    err instanceof SyntaxError && (
      msg.includes('unexpected token') || msg.includes('unexpected identifier') || msg.includes('unexpected end of input')
    )
  );
}

/** One hard reload per session when chunks are stale — picks up fresh index.html. */
export function reloadForStaleChunks() {
  const storage = globalThis.sessionStorage;
  const loc = globalThis.location;
  if (!storage || !loc?.reload) return false;
  if (storage.getItem(CHUNK_RELOAD_KEY)) return false;
  storage.setItem(CHUNK_RELOAD_KEY, '1');
  loc.reload();
  return true;
}

export function clearChunkReloadFlag() {
  globalThis.sessionStorage?.removeItem(CHUNK_RELOAD_KEY);
}

const RETRY_DELAYS_MS = [0, 400, 1200];

/**
 * Import a lazy route module with short retries, then reload once on chunk mismatch.
 * @param {() => Promise<{ default: React.ComponentType }>} importer
 */
export async function importRouteModule(importer) {
  let lastError;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((resolve) => { setTimeout(resolve, RETRY_DELAYS_MS[i]); });
    }
    try {
      const mod = await importer();
      clearChunkReloadFlag();
      return mod;
    } catch (err) {
      lastError = err;
      if (!isChunkLoadError(err)) throw err;
    }
  }
  if (isChunkLoadError(lastError) && reloadForStaleChunks()) {
    return new Promise(() => {});
  }
  throw lastError;
}
