import { apiGetJson } from './apiClient';
import {
  clampQualityToPlan,
  mergeProbeWithCatalogHint,
  pickMaxQualityForTrack,
  pickQualityForPlan,
  planMaxPlaybackQuality,
  sanitizeQualitiesForPlayer,
} from './qualityPrefs';
import { readQualityProbeCache, writeQualityProbeCache } from './qualityProbeCache';

function probeToAvailable(probeData, catalogQuality) {
  const rawAvailable = sanitizeQualitiesForPlayer(probeData?.available || []);
  const probeMax =
    probeData?.max_quality && probeData.max_quality !== 'LOW'
      ? probeData.max_quality
      : rawAvailable[rawAvailable.length - 1] || 'HIGH';
  return mergeProbeWithCatalogHint(rawAvailable, probeMax, catalogQuality).available;
}

/** Tiers with a verified Tidal manifest — safe for download jobs (no catalog-only FLAC). */
function probeToDownloadable(probeData, catalogQuality) {
  const verified = sanitizeQualitiesForPlayer(probeData?.downloadable || []);
  if (verified.length) return verified;
  return probeToAvailable(probeData, catalogQuality);
}

/** Quality for download from the player bar — honest tier from probe, not UI-only FLAC. */
export function resolvePlayingTrackDownloadQuality({
  streamQuality,
  playbackQuality,
  probeData,
  catalogQuality,
  availableQualities,
  downloadableQualities,
  qualitiesReady,
  effectivePlan,
}) {
  const tier = qualitiesReady ? streamQuality : playbackQuality;
  if (probeData?.available?.length) {
    return pickDownloadQualityFromProbe(tier, probeData, catalogQuality, effectivePlan);
  }
  const tiers = downloadableQualities?.length
    ? downloadableQualities
    : (availableQualities?.length ? availableQualities : [tier]);
  let picked = pickQualityForPlan(tier, tiers, effectivePlan);
  if (tier === 'LOSSLESS' && picked === 'HIGH' && tiers.includes('HI_RES')) {
    picked = 'HI_RES';
  }
  return picked;
}

/** Profile default (or plan max when auto) before per-track probe. */
export function downloadWantedTier({
  autoPlaybackQuality,
  defaultPlaybackQuality,
  effectivePlan,
}) {
  if (autoPlaybackQuality) {
    return planMaxPlaybackQuality(effectivePlan);
  }
  return clampQualityToPlan(defaultPlaybackQuality, effectivePlan);
}

/** Pick stream tier for a download job from probe + profile settings. */
export function pickDownloadQualityFromProbe(
  wanted,
  probeData,
  catalogQuality,
  effectivePlan,
  { autoPlaybackQuality = false } = {},
) {
  const available = probeToDownloadable(probeData, catalogQuality);
  if (autoPlaybackQuality) {
    const autoPicked = pickMaxQualityForTrack(available, effectivePlan, probeData);
    if (autoPicked === 'LOSSLESS' && available.includes('HI_RES')) {
      return 'HI_RES';
    }
    return autoPicked;
  }
  if (wanted === 'HI_RES' && available.includes('HI_RES')) {
    return 'HI_RES';
  }
  let picked = pickQualityForPlan(wanted, available, effectivePlan);
  const basicHiresOnly = effectivePlan === 'basic' && probeData?.lossless?.hires_only;
  if (picked === 'LOSSLESS' && available.includes('HI_RES') && !basicHiresOnly) {
    picked = 'HI_RES';
  }
  if (wanted === 'LOSSLESS' && picked === 'HIGH' && available.includes('HI_RES')) {
    picked = 'HI_RES';
  }
  return picked;
}

/**
 * Resolve download quality for a track without playing it.
 * Uses account default (or auto-best), capped by plan, with MAX → FLAC fallback.
 */
export async function resolveDownloadQualityForTrack(
  track,
  {
    autoPlaybackQuality,
    defaultPlaybackQuality,
    effectivePlan,
    lang = 'en',
  },
) {
  const wanted = downloadWantedTier({
    autoPlaybackQuality,
    defaultPlaybackQuality,
    effectivePlan,
  });

  if (!track?.provider_id) return wanted;

  const provider = track.provider || 'tidal';
  const trackId = String(track.provider_id);
  const cached = readQualityProbeCache(provider, trackId);
  if (cached?.available?.length) {
    return pickDownloadQualityFromProbe(
      wanted,
      cached,
      track.quality,
      effectivePlan,
      { autoPlaybackQuality },
    );
  }

  try {
    const data = await apiGetJson(`/api/quality/${provider}/${trackId}/available`, {
      auth: true,
      lang,
    });
    if (data?.available?.length) {
      writeQualityProbeCache(provider, trackId, data);
      return pickDownloadQualityFromProbe(
        wanted,
        data,
        track.quality,
        effectivePlan,
        { autoPlaybackQuality },
      );
    }
  } catch {
    /* probe failed — fall back to wanted tier */
  }

  const { available } = mergeProbeWithCatalogHint([], wanted, track.quality);
  if (autoPlaybackQuality) {
    return pickMaxQualityForTrack(available, effectivePlan);
  }
  return pickQualityForPlan(wanted, available, effectivePlan);
}
