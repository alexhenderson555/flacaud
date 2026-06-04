/** Playback quality order (highest → lowest). */
export const QUALITY_FALLBACK_ORDER = ['HI_RES', 'LOSSLESS', 'HIGH', 'LOW'];

export const ALL_UI_QUALITIES = ['LOW', 'HIGH', 'LOSSLESS', 'HI_RES'];

/** Max streaming tier per effective_plan (matches backend plan_limits.py). */
export const PLAN_MAX_PLAYBACK = {
  free: 'LOW',
  basic: 'HIGH',
  pro: 'HI_RES',
  lifetime: 'HI_RES',
};

export function planMaxPlaybackQuality(planId) {
  const id = (planId || 'free').toLowerCase();
  return PLAN_MAX_PLAYBACK[id] || 'LOW';
}

/** Clamp a UI quality id to the user's plan ceiling. */
export function clampQualityToPlan(quality, planId) {
  const maxQ = planMaxPlaybackQuality(planId);
  const qIdx = QUALITY_FALLBACK_ORDER.indexOf(quality);
  const maxIdx = QUALITY_FALLBACK_ORDER.indexOf(maxQ);
  if (qIdx < 0 || maxIdx < 0) return maxQ;
  if (qIdx < maxIdx) return maxQ;
  return quality;
}

/** Pick best available tier without exceeding plan cap. */
export function pickQualityForPlan(wanted, available, planId) {
  const capped = clampQualityToPlan(wanted, planId);
  const picked = pickBestAvailableQuality(capped, available);
  return clampQualityToPlan(picked, planId);
}

export function qualityTierLevel(quality) {
  return QUALITY_FALLBACK_ORDER.indexOf(quality);
}

export function isQualityAllowedForPlan(quality, planId) {
  const qIdx = qualityTierLevel(quality);
  const maxIdx = qualityTierLevel(planMaxPlaybackQuality(planId));
  if (qIdx < 0 || maxIdx < 0) return false;
  return qIdx >= maxIdx;
}

const DEFAULT_KEY = 'tidal-default-quality';
const SESSION_KEY = 'tidal-playback-quality';
const LEGACY_KEY = 'tidal-quality';

export function getDefaultPlaybackQuality() {
  return localStorage.getItem(DEFAULT_KEY)
    || localStorage.getItem(LEGACY_KEY)
    || 'LOW';
}

export function setDefaultPlaybackQuality(q) {
  localStorage.setItem(DEFAULT_KEY, q);
}

export function getStoredPlaybackQuality() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) return session;
  return getDefaultPlaybackQuality();
}

export function setStoredPlaybackQuality(q) {
  localStorage.setItem(SESSION_KEY, q);
}

/** Pick best tier: prefer wanted if available, else highest available. */
export function pickBestAvailableQuality(wanted, available) {
  if (!available?.length) return wanted || 'LOW';
  if (available.includes(wanted)) return wanted;
  return QUALITY_FALLBACK_ORDER.find((q) => available.includes(q)) || available[available.length - 1] || 'LOW';
}

/** Next lower tier for stream error recovery. */
export function lowerQualityTier(current, available) {
  const idx = QUALITY_FALLBACK_ORDER.indexOf(current);
  if (idx < 0) return null;
  for (let i = idx + 1; i < QUALITY_FALLBACK_ORDER.length; i++) {
    const q = QUALITY_FALLBACK_ORDER[i];
    if (!available?.length || available.includes(q)) return q;
  }
  return null;
}

export function qualityBadgeLabel(actual) {
  if (!actual) return '';
  if (actual === 'HI_RES' || actual === 'HI_RES_LOSSLESS') return 'MAX';
  if (actual === 'LOSSLESS') return 'FLAC';
  return actual;
}
