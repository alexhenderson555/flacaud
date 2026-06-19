/** Persist in-flight set analysis so SPA navigation can resume polling. */

const KEY = 'tidal-analyzer-active-job';

export function saveActiveAnalyzerJob({ jobId, url }) {
  if (!jobId || !url) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      jobId,
      url: String(url).trim(),
      savedAt: Date.now(),
    }));
  } catch {
    /* ignore */
  }
}

export function loadActiveAnalyzerJob(url) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const target = String(url || '').trim();
    if (!parsed?.jobId || !target || parsed.url !== target) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveAnalyzerJob(url) {
  try {
    const active = loadActiveAnalyzerJob(url);
    if (active) sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
