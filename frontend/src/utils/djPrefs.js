/** Pro (plan 3) and Lifetime — DJ analysis, filters, Camelot/BPM UI. */
const DJ_PLANS = new Set(['pro', 'lifetime']);

export function planAllowsDjFeatures(planId) {
  return DJ_PLANS.has((planId || 'free').toLowerCase());
}

export function canUseDjFeatures(effectivePlan, djEnabled) {
  return planAllowsDjFeatures(effectivePlan) && !!djEnabled;
}

/** Server ffmpeg preview is heavy (~90s/track) — serialize to avoid 503/timeouts. */
export const DJ_ANALYSIS_CONCURRENCY = 1;

export const DJ_PREFS_CHANGED_EVENT = 'tidal-dj-prefs-changed';

export function dispatchDjPrefsChanged() {
  window.dispatchEvent(new CustomEvent(DJ_PREFS_CHANGED_EVENT));
}
