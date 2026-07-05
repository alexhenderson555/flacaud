/**
 * Pure helpers for quality probe normalization — extracted from usePlaybackQuality
 * so they're independently testable and don't carry hook closure state.
 *
 * These transform raw /api/quality/.../available probe responses into the
 * normalized shape the player hook consumes.
 */

import {
  sanitizeQualitiesForPlayer,
  mergeProbeWithCatalogHint,
} from './qualityPrefs';

/**
 * Extract lossless sample rate / bit depth from a probe's lossless block.
 */
export function probeLosslessMeta(probe) {
  if (!probe?.lossless?.sample_rate) return {};
  return {
    sampleRate: probe.lossless.sample_rate,
    bitDepth: probe.lossless.bit_depth ?? null,
  };
}

/**
 * Normalize a raw probe response into the shape usePlaybackQuality consumes.
 *
 * - Falls back to HIGH-only when the probe returned no available tiers.
 * - Sanitizes the available/downloadable lists for the player UI.
 * - Merges a catalog hint (track.quality) into the probe max to avoid
 *   showing Lossless when the catalog only has HIGH.
 * - Caps actual["HIGH"] to HIGH — a probe that backfilled from a higher
 *   tier would make the picker snap back to Lossless right after picking 320k.
 */
export function normalizeProbeResult(data, trackKey, catalogQuality) {
  if (!data?.available?.length) {
    return {
      available: ['HIGH'],
      downloadable: ['HIGH'],
      max: 'HIGH',
      actual: {},
      probeData: { available: ['HIGH'], max_quality: 'HIGH', actual: {}, _trackKey: trackKey },
    };
  }
  const raw = sanitizeQualitiesForPlayer(data.available);
  const probeMax = data.max_quality && data.max_quality !== 'LOW'
    ? data.max_quality
    : raw[raw.length - 1] || 'HIGH';
  const { available: merged, max } = mergeProbeWithCatalogHint(raw, probeMax, catalogQuality);
  const actual = { ...(data.actual || {}) };
  if (actual.HIGH && /LOSSLESS|HI_RES/i.test(String(actual.HIGH))) actual.HIGH = 'HIGH';
  const probeData = { ...data, actual, _trackKey: trackKey };
  return {
    available: merged,
    downloadable: sanitizeQualitiesForPlayer(data.downloadable?.length ? data.downloadable : merged),
    max,
    actual,
    probeData,
  };
}
