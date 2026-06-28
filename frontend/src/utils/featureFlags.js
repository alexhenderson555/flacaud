/**
 * Lightweight feature flags so in-progress features can ship to prod turned OFF
 * and be enabled per-device for development / staging — no second server needed.
 *
 * Defaults below are the prod state (keep new/risky features `false`). Override
 * locally with the console (`__ff.enable('aiDj')`) or a `?ff=aiDj,continuousMix`
 * URL param. Overrides persist in localStorage per browser.
 */
const DEFAULTS = {
  aiDj: false, // AI DJ-set generator
  continuousMix: false, // beat-matched crossfade between tracks
};

const STORAGE_KEY = 'tidal-feature-flags';

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function isFeatureEnabled(name) {
  const overrides = readOverrides();
  if (name in overrides) return !!overrides[name];
  return !!DEFAULTS[name];
}

export function setFeatureFlag(name, on) {
  const overrides = readOverrides();
  overrides[name] = !!on;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

export function allFeatureFlags() {
  return { ...DEFAULTS, ...readOverrides() };
}

/** Boot-time dev helpers: `?ff=a,b` URL param + a `window.__ff` console toggle. */
export function initFeatureFlags() {
  if (typeof window === 'undefined') return;
  try {
    const q = new URLSearchParams(window.location.search).get('ff');
    if (q) {
      q.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => setFeatureFlag(n, true));
    }
  } catch {
    /* ignore */
  }
  window.__ff = {
    enable: (n) => setFeatureFlag(n, true),
    disable: (n) => setFeatureFlag(n, false),
    list: allFeatureFlags,
  };
}
