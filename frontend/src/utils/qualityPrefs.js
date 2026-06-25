/** Playback quality order (highest → lowest). No 96k tier in UI or fallbacks. */
export const QUALITY_FALLBACK_ORDER = ['HI_RES', 'LOSSLESS', 'HIGH'];

/** Internal probe / fallback order (HI_RES used for hi-res FLAC, not a separate button). */
export const PLAYER_UI_QUALITIES = ['HIGH', 'LOSSLESS', 'HI_RES'];

/** Two visible player buttons. */
export const PLAYER_VISIBLE_QUALITIES = ['HIGH', 'LOSSLESS'];

/** Max streaming tier per effective_plan (matches backend plan_limits.py). */
export const PLAN_MAX_PLAYBACK = {
  free: 'HIGH',
  basic: 'LOSSLESS',
  pro: 'HI_RES',
  lifetime: 'HI_RES',
};

export function planMaxPlaybackQuality(planId) {
  const id = (planId || 'free').toLowerCase();
  return PLAN_MAX_PLAYBACK[id] || 'HIGH';
}

/** Remove 96k from API probe lists for UI; keep at least 320k. */
export function sanitizeQualitiesForPlayer(available) {
  const filtered = (available || []).filter((q) => q !== 'LOW');
  return filtered.length ? filtered : ['HIGH'];
}

/**
 * HI_RES probe can succeed while LOSSLESS probe fails (Tidal API quirk).
 * Any max tier implies all lower UI tiers are requestable at playback.
 */
/** Map Tidal catalog track.quality to playable UI tiers. */
export function catalogQualityToUiTiers(catalogQuality) {
  const u = String(catalogQuality || '').toUpperCase();
  if (!u || u === 'LOW') return { tiers: ['HIGH'], max: 'HIGH' };
  if (u.includes('HI_RES') || u === 'MQA') {
    return { tiers: ['HIGH', 'LOSSLESS', 'HI_RES'], max: 'HI_RES' };
  }
  if (u.includes('LOSSLESS') || u === 'FLAC') {
    return { tiers: ['HIGH', 'LOSSLESS'], max: 'LOSSLESS' };
  }
  return { tiers: ['HIGH'], max: 'HIGH' };
}

export function mergeProbeWithCatalogHint(probeAvailable, probeMax, catalogQuality) {
  const base = sanitizeQualitiesForPlayer(probeAvailable);
  const { tiers: catalogTiers, max: catalogMax } = catalogQualityToUiTiers(catalogQuality);
  const catalogHighOnly = catalogTiers.filter((q) => q === 'HIGH');
  const combined = new Set([...base, ...catalogHighOnly]);
  const maxQ = QUALITY_FALLBACK_ORDER.find((q) => combined.has(q))
    || probeMax
    || (base.length ? probeMax : catalogMax)
    || 'HIGH';
  const available = expandAvailableQualities([...combined], maxQ);
  return { available, max: maxQ };
}

export function expandAvailableQualities(available, maxTrackQuality) {
  const tiers = new Set(sanitizeQualitiesForPlayer(available));
  const maxQ = maxTrackQuality && maxTrackQuality !== 'LOW' ? maxTrackQuality : null;
  if (maxQ === 'HI_RES' || tiers.has('HI_RES')) {
    tiers.add('LOSSLESS');
    tiers.add('HIGH');
  } else if (maxQ === 'LOSSLESS' || tiers.has('LOSSLESS')) {
    tiers.add('HIGH');
  }
  return PLAYER_VISIBLE_QUALITIES.filter((q) => tiers.has(q) || (q === 'LOSSLESS' && tiers.has('HI_RES')));
}

/** Visible qualities for this track + plan (Basic skips hi-res-only lossless). */
export function visibleQualitiesForTrack(availableQualities, maxTrackQuality, planId, probeData) {
  const expanded = expandAvailableQualities(availableQualities, maxTrackQuality);
  if (planMaxPlaybackQuality(planId) === 'HI_RES') {
    return expanded;
  }
  if (!probeData?.lossless?.hires_only) {
    return expanded;
  }
  return expanded.filter((q) => q !== 'LOSSLESS');
}

/** Clamp a UI quality id to the user's plan ceiling. */
export function clampQualityToPlan(quality, planId) {
  const maxQ = planMaxPlaybackQuality(planId);
  const q = quality === 'LOW' ? 'HIGH' : quality;
  const qIdx = QUALITY_FALLBACK_ORDER.indexOf(q);
  const maxIdx = QUALITY_FALLBACK_ORDER.indexOf(maxQ);
  if (qIdx < 0 || maxIdx < 0) return maxQ;
  if (qIdx < maxIdx) return maxQ;
  return q;
}

/** Pick best available tier without exceeding plan cap. */
export function pickQualityForPlan(wanted, available, planId) {
  const sanitized = sanitizeQualitiesForPlayer(available);
  const capped = clampQualityToPlan(wanted, planId);
  const picked = pickBestAvailableQuality(capped, sanitized);
  return clampQualityToPlan(picked, planId);
}

export function qualityTierLevel(quality) {
  return QUALITY_FALLBACK_ORDER.indexOf(quality);
}

export function isQualityAllowedForPlan(quality, planId) {
  if (quality === 'LOW') return false;
  const qIdx = qualityTierLevel(quality);
  const maxIdx = qualityTierLevel(planMaxPlaybackQuality(planId));
  if (qIdx < 0 || maxIdx < 0) return false;
  return qIdx >= maxIdx;
}

/** Per-track: tier must be in probe list and not above track max (HI_RES index 0 = highest). */
export function resolveMaxTrackQuality(maxTrackQuality, availableQualities) {
  const normalized = maxTrackQuality && maxTrackQuality !== 'LOW' ? maxTrackQuality : null;
  if (normalized && qualityTierLevel(normalized) >= 0) return normalized;
  for (const q of QUALITY_FALLBACK_ORDER) {
    if (sanitizeQualitiesForPlayer(availableQualities).includes(q)) return q;
  }
  return 'HIGH';
}

export function isQualityAvailableForTrack(quality, availableQualities, maxTrackQuality) {
  if (!quality || quality === 'LOW') return false;
  const list = sanitizeQualitiesForPlayer(availableQualities);
  if (!list.includes(quality)) return false;
  const qIdx = qualityTierLevel(quality);
  const maxIdx = qualityTierLevel(resolveMaxTrackQuality(maxTrackQuality, availableQualities));
  if (qIdx < 0 || maxIdx < 0) return false;
  return qIdx >= maxIdx;
}

/** Player / stream: Lossless when probe has FLAC (often via internal HI_RES tier). */
export function isPlaybackQualityAvailable(
  quality,
  availableQualities,
  maxTrackQuality,
  planId = 'pro',
  probeData = null,
) {
  if (quality === 'LOSSLESS') {
    if (isTidalCatalogOnlyLossless(probeData)) return false;
    const hasLossless = isQualityAvailableForTrack('LOSSLESS', availableQualities, maxTrackQuality)
      || isQualityAvailableForTrack('HI_RES', availableQualities, maxTrackQuality);
    if (!hasLossless) return false;
    if (planMaxPlaybackQuality(planId) === 'HI_RES') return true;
    if (probeData?.lossless?.available && !probeData.lossless.hires_only) return true;
    if (probeData?.lossless?.hires_only) return false;
    return hasLossless;
  }
  return isQualityAvailableForTrack(quality, availableQualities, maxTrackQuality);
}

/** Ensure FLAC appears in UI lists when MAX is present. */
export function ensureLosslessInAvailableList(available, maxTrackQuality) {
  const base = sanitizeQualitiesForPlayer(available);
  return expandAvailableQualities(base, maxTrackQuality || base[base.length - 1] || 'HIGH');
}

/** UI qualities the user may select for the current plan (before per-track probe). */
export function qualitiesAllowedForPlan(planId) {
  return PLAYER_VISIBLE_QUALITIES.filter((q) => isQualityAllowedForPlan(q, planId));
}

const DEFAULT_KEY = 'tidal-default-quality';
const AUTO_KEY = 'tidal-auto-quality';
const SESSION_KEY = 'tidal-playback-quality';
const LEGACY_KEY = 'tidal-quality';

function normalizeStoredQuality(q) {
  if (!q || q === 'LOW') return 'HIGH';
  if (q === 'HI_RES') return 'LOSSLESS';
  return q;
}

export function getDefaultPlaybackQuality() {
  return normalizeStoredQuality(
    localStorage.getItem(DEFAULT_KEY)
      || localStorage.getItem(LEGACY_KEY)
      || 'HIGH',
  );
}

export function setDefaultPlaybackQuality(q) {
  localStorage.setItem(DEFAULT_KEY, normalizeStoredQuality(q));
}

/** When true (default), each track plays at the best tier allowed by plan + probe. */
export function isAutoPlaybackQuality() {
  const raw = localStorage.getItem(AUTO_KEY);
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

export function setAutoPlaybackQuality(enabled) {
  localStorage.setItem(AUTO_KEY, enabled ? '1' : '0');
}

/** Best stream tier for this track within the user's plan ceiling. */
export function pickMaxQualityForTrack(available, planId, probeData = null) {
  const planMax = planMaxPlaybackQuality(planId);
  if (planMax === 'HI_RES') {
    if (available.includes('HI_RES') || available.includes('LOSSLESS')) {
      return 'LOSSLESS';
    }
    return 'HIGH';
  }
  if (planMax === 'LOSSLESS') {
    if (probeData?.lossless?.hires_only) {
      return 'HIGH';
    }
    if (available.includes('HI_RES') || available.includes('LOSSLESS')) {
      return 'LOSSLESS';
    }
  }
  return pickQualityForPlan(planMax, available, planId);
}

export function getStoredPlaybackQuality() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) return normalizeStoredQuality(session);
  return getDefaultPlaybackQuality();
}

export function setStoredPlaybackQuality(q) {
  localStorage.setItem(SESSION_KEY, normalizeStoredQuality(q));
}

/** Pick best tier: prefer wanted if available, else highest available. */
export function pickBestAvailableQuality(wanted, available) {
  const list = sanitizeQualitiesForPlayer(available);
  const w = normalizeStoredQuality(wanted);
  if (!list.length) return w || 'HIGH';
  if (list.includes(w)) return w;
  return QUALITY_FALLBACK_ORDER.find((q) => list.includes(q)) || list[list.length - 1] || 'HIGH';
}

/** Next lower tier for stream error recovery (never below 320k). */
export function lowerQualityTier(current, available) {
  const list = sanitizeQualitiesForPlayer(available);
  const idx = QUALITY_FALLBACK_ORDER.indexOf(current);
  if (idx < 0) return null;
  for (let i = idx + 1; i < QUALITY_FALLBACK_ORDER.length; i++) {
    const q = QUALITY_FALLBACK_ORDER[i];
    if (list.includes(q)) return q;
  }
  return null;
}

export function qualityButtonLabel(qualityId) {
  const u = String(qualityId || '').toUpperCase();
  if (u === 'HIGH' || u === 'LOW') return '320k';
  if (u === 'LOSSLESS' || u === 'HI_RES' || u === 'HI_RES_LOSSLESS') return 'Lossless';
  return qualityId;
}

/** Human-readable sample rate for stream badges (44.1 kHz, 96 kHz, …). */
export function formatSampleRateLabel(hz) {
  const n = Number(hz);
  if (!n || n <= 0) return null;
  if (n % 1000 === 0) return `${n / 1000} kHz`;
  const khz = n / 1000;
  return `${khz % 1 === 0 ? khz : khz.toFixed(1)} kHz`;
}

function isAacTier(tier) {
  const u = String(tier || '').toUpperCase();
  return !u || u === 'HIGH' || u === 'LOW';
}

/** Map a stream tier to player UI button id (HIGH | LOSSLESS). */
export function uiQualityButtonId(tier) {
  return isAacTier(tier) ? 'HIGH' : 'LOSSLESS';
}

/** Active quality button — requested tier wins while switching or loading. */
export function resolvePlayerUiQuality({
  deliveredStream = null,
  streamQuality = 'HIGH',
  playbackQuality = 'HIGH',
  qualitiesReady = false,
  isLoading = false,
}) {
  const requested = streamQuality || playbackQuality || 'HIGH';
  const requestedUi = uiQualityButtonId(requested);
  const delivered = deliveredStream?.tier;
  const deliveredUi = delivered ? uiQualityButtonId(delivered) : null;

  if (isLoading) return requestedUi;
  if (deliveredUi && requestedUi !== deliveredUi) return requestedUi;
  if (qualitiesReady && delivered) return deliveredUi;
  return requestedUi;
}

/**
 * Player badge: 320k for AAC, otherwise delivered FLAC sample rate.
 * @param {{ tier?: string, sampleRate?: number|null, bitDepth?: number|null }} delivered
 * @param {string} [requestedTier]
 */
export function streamBadgeLabel(delivered = {}, requestedTier = 'HIGH') {
  const d = delivered ?? {};
  const tier = d.tier || requestedTier;
  if (isAacTier(tier)) return '320k';
  const freq = formatSampleRateLabel(d.sampleRate);
  if (freq) return freq;
  return 'Lossless';
}

/** User-facing tier labels (downloads, toasts) — two UI tiers: 320k and Lossless. */
export function qualityBadgeLabel(actual) {
  if (!actual) return '';
  return qualityButtonLabel(actual);
}

/** Toast when download tier differs from playback in a user-visible way (not LOSSLESS↔HI_RES). */
export function shouldNotifyDownloadTierFallback(streamTier, downloadTier) {
  if (!streamTier || !downloadTier || streamTier === downloadTier) return false;
  const a = qualityButtonLabel(streamTier);
  const b = qualityButtonLabel(downloadTier);
  return a !== b;
}

/** Skip noisy fallback toasts when 320k is expected or during radio bootstrap. */
export function shouldAnnounceQualityFallback({
  effective,
  lower = null,
  suppressed = false,
} = {}) {
  if (suppressed) return false;
  if (effective === 'HIGH' || lower === 'HIGH') return false;
  return true;
}

/** Map registry / API quality strings to UI tier ids. */
export function normalizeRegistryQuality(q) {
  if (!q) return null;
  const u = String(q).toUpperCase();
  if (u === 'HI_RES' || u === 'HI_RES_LOSSLESS') return 'HI_RES';
  if (u === 'LOSSLESS') return 'LOSSLESS';
  if (u === 'HIGH' || u === 'LOW') return 'HIGH';
  return null;
}

/**
 * Use the on-server download only when its stored tier matches playback.
 * Legacy string entries (path only) → always stream so quality switch works.
 */
export function shouldStreamFromRegistry(entry, streamQuality) {
  if (!entry || typeof entry === 'string') return false;
  const fileQ = normalizeRegistryQuality(entry.quality);
  if (!fileQ) return false;
  return fileQ === streamQuality;
}

export function buildStreamSrcKey(trackKey, streamQuality, streamRetryNonce, bypass) {
  return `${trackKey}:${streamQuality}:${streamRetryNonce}:${bypass}`;
}

export function parseStreamSrcKey(srcKey) {
  if (!srcKey) return null;
  const lastColon = srcKey.lastIndexOf(':');
  if (lastColon <= 0) return null;
  const bypass = srcKey.slice(lastColon + 1);
  const rest = srcKey.slice(0, lastColon);
  const nonceColon = rest.lastIndexOf(':');
  if (nonceColon <= 0) return null;
  const streamRetryNonce = rest.slice(nonceColon + 1);
  const rest2 = rest.slice(0, nonceColon);
  const qualityColon = rest2.lastIndexOf(':');
  if (qualityColon <= 0) return null;
  return {
    trackKey: rest2.slice(0, qualityColon),
    streamQuality: rest2.slice(qualityColon + 1),
    streamRetryNonce,
    bypass,
  };
}

/** True when audio is audibly playing (not paused at start). */
export function isActivelyPlayingAudio(isPlaying, audioEl) {
  if (!isPlaying || !audioEl) return false;
  if (audioEl.paused) return false;
  return (audioEl.currentTime || 0) > 0.25;
}

/** Paused mid-track with buffered data — keep `<audio src>` stable on resume. */
export function isPausedMidPlayback(audioEl, { minSeconds = 0.25 } = {}) {
  if (!audioEl?.paused) return false;
  const src = audioEl.currentSrc || audioEl.src || '';
  if (!src) return false;
  return (audioEl.currentTime || 0) > minSeconds;
}

/** Read bypass_registry from a stream URL (blob URLs return null). */
export function parseBypassFromStreamUrl(url) {
  if (!url || url.startsWith('blob:')) return null;
  if (url.includes('bypass_registry=true')) return 'true';
  if (url.includes('bypass_registry=false')) return 'false';
  return null;
}

/** Same stream resource — ignores short-lived query params (mt, _rn). */
export function sameStreamResource(a, b) {
  if (!a || !b) return a === b;
  if (a === b) return true;
  if (a.startsWith('blob:') || b.startsWith('blob:')) return a === b;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const ua = new URL(a, base);
    const ub = new URL(b, base);
    if (ua.pathname !== ub.pathname) return false;
    return (ua.searchParams.get('quality') || '') === (ub.searchParams.get('quality') || '');
  } catch {
    return false;
  }
}

/**
 * Defer switching to on-server download file mid-playback — URL change reloads `<audio>`.
 * Returns bypass flag for stream URL (`'true'` = bypass registry, `'false'` = use registry file).
 */
export function resolveStreamBypass({
  registryEntry,
  streamQuality,
  trackKey,
  streamRetryNonce,
  loadedSrcKey,
  activeStreamUrl = '',
  isActivelyPlaying,
  isPlaying = false,
}) {
  const useRegistry = shouldStreamFromRegistry(registryEntry, streamQuality);
  const idealBypass = useRegistry ? 'false' : 'true';
  const holdRegistrySwap = isActivelyPlaying || isPlaying;

  if (!holdRegistrySwap || idealBypass !== 'false') {
    return idealBypass;
  }

  const urlBypass = parseBypassFromStreamUrl(activeStreamUrl);
  if (urlBypass === 'true') {
    return 'true';
  }

  if (!loadedSrcKey) {
    return idealBypass;
  }

  const parsed = parseStreamSrcKey(loadedSrcKey);
  if (!parsed) return idealBypass;

  const sameTrack =
    parsed.trackKey === trackKey
    && parsed.streamQuality === streamQuality
    && parsed.streamRetryNonce === String(streamRetryNonce);

  if (sameTrack && parsed.bypass === 'true') {
    return 'true';
  }

  return idealBypass;
}

/** Applying a deferred registry swap after pause/end (bypass true → false). */
export function isDeferredRegistrySwap(prevSrcKey, nextSrcKey) {
  const prev = parseStreamSrcKey(prevSrcKey);
  const next = parseStreamSrcKey(nextSrcKey);
  if (!prev || !next) return false;
  return (
    prev.bypass === 'true'
    && next.bypass === 'false'
    && prev.trackKey === next.trackKey
    && prev.streamQuality === next.streamQuality
    && prev.streamRetryNonce === next.streamRetryNonce
  );
}

/** Tidal catalog says Lossless but playback API returned AAC only. */
export function isTidalCatalogOnlyLossless(probeData) {
  return Boolean(probeData?.lossless?.catalog_only);
}

/** Probe is complete enough to show per-track quality fallback toasts. */
export function isProbeReadyForTrack(probeData, trackKey) {
  if (!probeData || !trackKey) return false;
  if (probeData._trackKey && probeData._trackKey !== trackKey) return false;
  return probeData.probe_complete !== false || isTidalCatalogOnlyLossless(probeData);
}

/** Qualities we can actually stream (excludes catalog-only Lossless). */
export function streamableQualitiesForTrack(available, probeData) {
  const list = sanitizeQualitiesForPlayer(available);
  if (!isTidalCatalogOnlyLossless(probeData)) return list;
  const filtered = list.filter((q) => q !== 'LOSSLESS' && q !== 'HI_RES');
  return filtered.length ? filtered : ['HIGH'];
}

export function uiQualityLabel(quality) {
  return quality === 'LOSSLESS' ? 'Lossless' : '320k';
}

function fillQualityTemplate(tpl, vars) {
  if (!tpl) return '';
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
    tpl,
  );
}

export function qualityUnavailableTooltip(lang, { planBlocked, tidalCatalogOnly, tier, dict }) {
  const d = dict || {};
  const label = uiQualityLabel(tier);
  if (planBlocked) {
    return fillQualityTemplate(d.qualityTooltipPlanBlocked, { quality: label })
      || `${label} — paid plan required`;
  }
  if (tidalCatalogOnly && tier === 'LOSSLESS') {
    return d.qualityTooltipTidalCatalogOnly
      || 'Tidal streams this track in 320k only (Lossless in catalog, no FLAC stream yet)';
  }
  return fillQualityTemplate(d.qualityTooltipUnavailable, { quality: label })
    || `${label} — not available for this track`;
}

export function qualityPreferenceFallbackToast(lang, {
  planBlocked, tidalCatalogOnly, pref, effective, dict,
}) {
  const d = dict || {};
  const prefLabel = uiQualityLabel(pref);
  const effectiveLabel = uiQualityLabel(effective);
  const ru = lang === 'ru';
  if (planBlocked) {
    return d.qualityPreferencePlanBlocked
      || (ru ? 'Это качество на платном тарифе — переключили на 320k' : 'Upgrade plan for this quality — switched to 320k');
  }
  if (tidalCatalogOnly) {
    return fillQualityTemplate(d.qualityPreferenceTidalFallback, {
      preferred: prefLabel,
      effective: effectiveLabel,
    })
      || (ru
        ? `Tidal не отдаёт ${prefLabel} для этого трека — играем ${effectiveLabel}`
        : `Tidal has no ${prefLabel} stream for this track — playing ${effectiveLabel}`);
  }
  return fillQualityTemplate(d.qualityPreferenceGenericFallback, {
    preferred: prefLabel,
    effective: effectiveLabel,
  })
    || (ru
      ? `${prefLabel} недоступно — переключили на ${effectiveLabel}`
      : `${prefLabel} unavailable — switched to ${effectiveLabel}`);
}

export function qualityTierBlockedToast(lang, { tidalCatalogOnly, dict }) {
  const d = dict || {};
  if (tidalCatalogOnly) {
    return d.qualityTierBlockedTidal
      || 'Tidal does not stream Lossless for this track — 320k only';
  }
  return d.qualityTierBlockedGeneric
    || 'This quality is not available for this track';
}

export function streamQualityTidalFallbackToast(lang, { quality, dict }) {
  const d = dict || {};
  const qLabel = uiQualityLabel(quality);
  return fillQualityTemplate(d.streamQualityTidalFallback, { quality: qLabel })
    || `Tidal has no Lossless stream — switching to ${qLabel}`;
}

export const ALL_UI_QUALITIES = ['HIGH', 'LOSSLESS'];
