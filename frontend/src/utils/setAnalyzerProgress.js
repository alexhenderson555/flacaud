/** Set Analyzer job polling and progress mapping (mirrors backend set_analyzer.py). */

export const ANALYZER_POLL_MS = 2000;
/** ~1 h at 2 s — matches worker job_timeout for long mixes */
export const ANALYZER_MAX_ATTEMPTS = 1800;
export const ANALYZER_SCAN_INTERVAL_SEC = 30;

export const ANALYZER_STAGE_IDS = ['download', 'process', 'identify'];

const PHASE_TO_STAGE = {
  queued: 0,
  download: 0,
  process: 1,
  scan: 2,
  identify: 2,
  done: 3,
  failed: 0,
};

/**
 * Prefer structured `analysis` from GET /api/jobs/{id}; fall back to legacy label parsing.
 */
export function resolveAnalyzerProgress(progressLabel, { status = 'running', trackCount = 0, analysis = null } = {}) {
  if (analysis && typeof analysis === 'object') {
    const phase = analysis.phase || status;
    const tracksFound = Math.max(Number(analysis.tracks_found) || 0, trackCount);
    let stageIndex = Math.min(
      ANALYZER_STAGE_IDS.length - 1,
      PHASE_TO_STAGE[phase] ?? 0,
    );
    // Tracks can appear before analysis.phase catches up (poll race or pydub load lag).
    if (status === 'running' && tracksFound > 0 && stageIndex < 2) {
      stageIndex = 2;
    }
    const barPercent = phase === 'done'
      ? 100
      : Math.max(2, Math.min(99, Number(analysis.percent) || 0));
    return {
      stageIndex,
      barPercent,
      inScanPhase: phase === 'scan' || phase === 'identify'
        || (status === 'running' && tracksFound > 0),
      segmentsDone: Number(analysis.segments_done) || 0,
      segmentsTotal: Number(analysis.segments_total) || 0,
      tracksFound,
      phase: (status === 'running' && tracksFound > 0 && phase === 'process') ? 'scan' : phase,
      label: analysis.label || progressLabel || '',
    };
  }

  if (status === 'queued') {
    return {
      stageIndex: 0,
      barPercent: 2,
      inScanPhase: false,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'queued',
      label: progressLabel || '',
    };
  }
  if (status === 'done') {
    return {
      stageIndex: ANALYZER_STAGE_IDS.length,
      barPercent: 100,
      inScanPhase: false,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'done',
      label: progressLabel || '',
    };
  }

  const label = String(progressLabel || '');
  const lower = label.toLowerCase();

  if (lower.includes('downloading')) {
    const m = label.match(/(\d+)%/);
    const downloadPct = m ? parseInt(m[1], 10) : 0;
    return {
      stageIndex: 0,
      barPercent: Math.max(5, Math.round(downloadPct * 0.14)),
      inScanPhase: false,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'download',
      label,
    };
  }
  if (lower.includes('processing')) {
    return {
      stageIndex: 1,
      barPercent: 16,
      inScanPhase: false,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'process',
      label,
    };
  }
  if (lower.includes('analyzing audio')) {
    return {
      stageIndex: 2,
      barPercent: 20,
      inScanPhase: true,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'scan',
      label,
    };
  }
  if (lower.includes('analyzing')) {
    const m = label.match(/(\d+)%/);
    const scanPct = m ? parseInt(m[1], 10) : 0;
    let barPercent = 20 + Math.round(scanPct * 0.73);
    if (trackCount > 0) {
      barPercent = Math.max(barPercent, Math.min(95, 25 + trackCount * 2));
    }
    return {
      stageIndex: 2,
      barPercent,
      inScanPhase: true,
      segmentsDone: 0,
      segmentsTotal: 0,
      tracksFound: trackCount,
      phase: 'scan',
      label,
    };
  }

  return {
    stageIndex: 0,
    barPercent: trackCount > 0 ? Math.min(90, 30 + trackCount * 2) : 5,
    inScanPhase: false,
    segmentsDone: 0,
    segmentsTotal: 0,
    tracksFound: trackCount,
    phase: status,
    label,
  };
}

export function formatAnalyzerPollTime(timestampMs, lang = 'en') {
  if (!timestampMs) return '—';
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  return new Date(timestampMs).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatAnalyzerSegments(done, total, lang = 'en') {
  if (!total || total <= 0) return '';
  const d = Math.max(0, Number(done) || 0);
  const t = Math.max(0, Number(total) || 0);
  return lang === 'ru'
    ? `Сегмент ${d} из ${t}`
    : `Segment ${d} of ${t}`;
}
