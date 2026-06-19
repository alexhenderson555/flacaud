import { Loader2 } from 'lucide-react';

export default function SyncProgressPanel({ t, progress }) {
  if (!progress) return null;

  const { phase, done, total, matched, percent, label } = progress;
  const showCounter = phase === 'matching' && total > 0;
  const phaseLabel = phase === 'reading'
    ? t('syncPhaseReading')
    : phase === 'matching'
      ? t('syncPhaseMatching')
      : phase === 'queued'
        ? t('syncPhaseQueued')
        : label;

  return (
    <div className="sync-progress glass-panel" data-testid="sync-progress">
      <div className="sync-progress__head">
        <Loader2 className="spinner" size={18} aria-hidden />
        <div className="sync-progress__text">
          <div className="sync-progress__title">{phaseLabel}</div>
          {label && phase !== 'reading' && phase !== 'queued' && (
            <div className="sync-progress__label">{label}</div>
          )}
          {showCounter && (
            <div className="sync-progress__counter" data-testid="sync-progress-counter">
              {t('syncProgress', { done, total, matched })}
            </div>
          )}
        </div>
        <span className="sync-progress__percent">{percent}%</span>
      </div>
      <div className="sync-progress__bar-track">
        <div
          className="sync-progress__bar-fill"
          data-testid="sync-progress-bar"
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
    </div>
  );
}
