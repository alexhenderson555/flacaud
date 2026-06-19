import { Loader2, X } from 'lucide-react';
import {
  ANALYZER_STAGE_IDS,
  formatAnalyzerPollTime,
  formatAnalyzerSegments,
} from '../../utils/setAnalyzerProgress';

const STAGE_LABEL_KEYS = {
  download: 'stageDownload',
  process: 'stageProcess',
  identify: 'stageIdentify',
};

// Live progress for a running analyze_set job: spinner + status, stage chips,
// scan-step hint, and the progress bar. Presentational — all state is passed in.
export default function AnalyzerProgressPanel({
  t,
  lang,
  analysisProgress,
  lastPollAt,
  trackCount,
  analysisUi,
  onCancel,
}) {
  return (
    <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="analyzer-progress">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <Loader2 className="spinner" size={20} color="var(--accent-solid)" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{t('analyzing')}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {analysisProgress || t('waitingQueue')}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, var(--text-secondary))', marginTop: '6px' }} data-testid="analyzer-poll-hint">
            {t('statusPollHint')}
            {lastPollAt ? ` · ${t('lastUpdate')} ${formatAnalyzerPollTime(lastPollAt, lang)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          {trackCount > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-solid)', fontWeight: 600 }} data-testid="analyzer-track-count">
              {trackCount} {t('tracksFoundSoFar')}
            </span>
          )}
          <button
            type="button"
            className="btn-secondary"
            data-testid="analyzer-cancel"
            onClick={onCancel}
            style={{
              borderRadius: '999px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
            }}
          >
            <X size={14} /> {t('cancelAnalysis')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} data-testid="analyzer-stages">
        {ANALYZER_STAGE_IDS.map((stageId, index) => {
          const done = index < analysisUi.stageIndex;
          const active = index === analysisUi.stageIndex;
          return (
            <span
              key={stageId}
              data-stage={stageId}
              data-active={active ? 'true' : 'false'}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '999px',
                fontWeight: active ? 600 : 500,
                background: active
                  ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.18)'
                  : done
                    ? 'rgba(34, 197, 94, 0.12)'
                    : 'var(--bg-surface-hover)',
                color: active
                  ? 'var(--accent-solid)'
                  : done
                    ? '#22c55e'
                    : 'var(--text-secondary)',
                border: active ? '1px solid rgba(var(--accent-rgb, 99, 102, 241), 0.35)' : '1px solid transparent',
              }}
            >
              {done ? '✓ ' : ''}{t(STAGE_LABEL_KEYS[stageId])}
            </span>
          );
        })}
      </div>

      {analysisUi.inScanPhase && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
          <span data-testid="analyzer-scan-hint">{t('scanStepHint')}</span>
          {analysisUi.segmentsTotal > 0 && (
            <span data-testid="analyzer-segment-progress" style={{ color: 'var(--accent-solid)', fontWeight: 500 }}>
              {t('segmentProgress')}: {formatAnalyzerSegments(analysisUi.segmentsDone, analysisUi.segmentsTotal, lang)}
            </span>
          )}
        </div>
      )}

      <div style={{ width: '100%', height: '6px', background: 'var(--bg-surface-hover)', borderRadius: '4px', overflow: 'hidden' }}>
        <div
          data-testid="analyzer-progress-bar"
          style={{
            height: '100%',
            width: `${analysisUi.barPercent}%`,
            background: 'var(--accent-gradient)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
