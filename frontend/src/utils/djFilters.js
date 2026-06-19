/** DJ filter helpers (library + tests). */

export const BPM_FILTER_MIN = 60;
export const BPM_FILTER_MAX = 200;

export function isBpmFilterActive(range) {
  if (!range) return false;
  return range.min > BPM_FILTER_MIN || range.max < BPM_FILTER_MAX;
}

/**
 * @param {object|null} feat - from getLibraryTrackFeatures
 * @param {{ filterKey?: string|null, bpmRange?: { min: number, max: number } }} opts
 */
export function trackMatchesDjFilters(feat, { filterKey = null, bpmRange, isBpmActive }) {
  const bpmOn = isBpmActive ?? isBpmFilterActive(bpmRange);

  if (filterKey) {
    if (feat?.camelotKey && feat.camelotKey !== filterKey) return false;
  }

  if (bpmOn && feat?.bpm != null) {
    if (feat.bpm < bpmRange.min || feat.bpm > bpmRange.max) return false;
  }

  return true;
}
