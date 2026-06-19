/** Set Analyzer helpers (tracklist timestamps, etc.). */

import { trackDurationSeconds } from './trackDuration';
import { normalizeTrack } from './trackNormalize';

/** Normalize analyzer `matched_track` for the global Tidal player. */
export function normalizeSetMatchedTrack(row) {
  const raw = row?.matched_track;
  if (!raw) return null;

  let artists = Array.isArray(raw.artists) ? raw.artists : [];
  if (!artists.length && typeof raw.artists_json === 'string') {
    try {
      const parsed = JSON.parse(raw.artists_json || '[]');
      artists = Array.isArray(parsed) ? parsed : [];
    } catch {
      artists = [];
    }
  }
  if (!artists.length && row?.artist) artists = [row.artist];
  if (!artists.length && raw.artist) artists = [String(raw.artist)];

  const track = normalizeTrack({ ...raw, artists });
  const id = track?.provider_id;
  if (!id || id === 'undefined' || id === 'null') return null;
  return track;
}

export function parseSetTimestamp(ts) {
  const parts = String(ts || '').split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** True when API says failed but analysis metadata indicates a finished scan. */
export function analyzerJobSucceededDespiteFailedStatus(data) {
  const trackCount = data?.set_tracks?.length || 0;
  if (!trackCount || data?.status !== 'failed') return false;
  const phase = data?.analysis?.phase;
  const label = String(data?.analysis?.label || '');
  const trackError = data?.tracks?.[0]?.error;
  if (trackError) return false;
  if (phase === 'done') return true;
  return /analysis complete|анализ заверш/i.test(label);
}

export function analyzerJobErrorDetail(data) {
  const trackError = data?.tracks?.[0]?.error;
  if (trackError) return String(trackError).trim();
  if (data?.analysis?.phase === 'failed') {
    return String(data?.analysis?.label || '').trim();
  }
  return '';
}

/** Normalize API job snapshot for the analyzer UI (status + banner text). */
export function resolveAnalyzerJobOutcome(data, t) {
  const trackCount = data?.set_tracks?.length || 0;
  let status = data?.status || 'idle';

  if (analyzerJobSucceededDespiteFailedStatus(data)) {
    status = 'done';
  }

  if (status === 'done') {
    return { status, error: null, trackCount };
  }
  if (status === 'failed' || status === 'cancelled') {
    return {
      status,
      trackCount,
      error: formatAnalyzerErrorMessage({
        status,
        trackCount,
        serverError: analyzerJobErrorDetail(data),
        t,
      }),
    };
  }
  return { status, error: null, trackCount };
}

/**
 * Duration for a set tracklist row: Tidal match first, else gap to next timestamp in the mix.
 */
export function formatAnalyzerErrorMessage({
  status,
  trackCount = 0,
  serverError = '',
  timedOut = false,
  t,
}) {
  const detail = (serverError || '').trim();
  const n = Number(trackCount) || 0;
  const detailLooksSuccessful = /^(analysis complete|анализ заверш)/i.test(detail);
  if (timedOut && n > 0) {
    return t('analysisPartialTimeout').replace('{n}', String(n));
  }
  if ((status === 'failed' || timedOut) && n > 0) {
    const base = t('analysisPartialFailed').replace('{n}', String(n));
    if (!detail || detailLooksSuccessful) return base;
    return `${base} ${detail}`;
  }
  if (timedOut) return t('analysisTimedOut');
  if (status === 'cancelled') return detail || t('analysisCancelled');
  if (status === 'failed') return detail || t('analysisFailed');
  return detail || null;
}

export function analyzerErrorTone({ status, trackCount = 0, timedOut = false }) {
  const n = Number(trackCount) || 0;
  if (n > 0 && (status === 'failed' || timedOut)) return 'warning';
  if (status === 'failed' || timedOut) return 'error';
  return 'error';
}

export function setTrackRowDurationSeconds(row, nextRow, matchedTrack) {
  const fromMatch = trackDurationSeconds(matchedTrack);
  if (fromMatch > 0) return fromMatch;

  if (nextRow?.timestamp) {
    const delta = parseSetTimestamp(nextRow.timestamp) - parseSetTimestamp(row.timestamp);
    if (delta > 0 && delta <= 7200) return delta;
  }
  return 0;
}
