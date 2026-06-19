import { useState, useMemo } from 'react';
import { Disc3, Loader2, Sparkles } from 'lucide-react';
import { normalizeSetMatchedTrack } from '../../utils/setAnalyzerUtils';
import { getAnalyzedFeaturesOnly } from '../../utils/trackFeatures';
import { buildSetDjInsights } from '../../utils/setDjInsights';

const QUALITY_LABEL = {
  en: {
    smooth: 'Smooth',
    good: 'Harmonic',
    'key-ok': 'Key OK',
    'bpm-ok': 'BPM jump',
    risky: 'Risky',
    unknown: '—',
  },
  ru: {
    smooth: 'Плавно',
    good: 'Гармонично',
    'key-ok': 'Тональность ок',
    'bpm-ok': 'Скачок BPM',
    risky: 'Риск',
    unknown: '—',
  },
};

export default function SetDjInsights({
  rows,
  lang = 'en',
  pendingCount = 0,
  getFeatures,
  onAnalyzeBatch,
}) {
  const L = QUALITY_LABEL[lang] || QUALITY_LABEL.en;
  const [analyzeRequested, setAnalyzeRequested] = useState(false);
  const insights = useMemo(() => buildSetDjInsights(rows, (row) => {
    const track = normalizeSetMatchedTrack(row);
    if (!track) return null;
    return getFeatures?.(track) || getAnalyzedFeaturesOnly(track);
  }), [rows, getFeatures]);

  if (!insights.totalMatched) return null;

  const maxBpm = Math.max(...insights.bpmSeries.map((e) => e.bpm), 1);
  const needsAnalyze = insights.analyzedCount < 2 && insights.totalMatched >= 2;
  const analyzing = analyzeRequested && pendingCount > 0;

  const handleAnalyze = () => {
    setAnalyzeRequested(true);
    onAnalyzeBatch?.();
  };

  return (
    <section className="set-dj-insights glass-panel" data-testid="set-dj-insights">
      <div className="set-dj-insights__head">
        <Disc3 size={18} aria-hidden />
        <h3>{lang === 'ru' ? 'DJ-разбор сета' : 'Set DJ insights'}</h3>
        {needsAnalyze && onAnalyzeBatch && (
          <button
            type="button"
            className="set-dj-insights__analyze-btn"
            onClick={handleAnalyze}
            disabled={analyzing}
            data-testid="set-dj-analyze-batch"
          >
            {analyzing ? <Loader2 size={14} className="spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {lang === 'ru' ? 'Анализ BPM/Key' : 'Analyze BPM/Key'}
          </button>
        )}
      </div>

      {insights.analyzedCount < 2 ? (
        <p className="set-dj-insights__hint">
          {lang === 'ru'
            ? 'Нужны BPM и Camelot у сопоставленных треков — нажмите «Анализ» или откройте треки в медиатеке.'
            : 'Matched tracks need BPM & Camelot — click Analyze or open tracks in your library.'}
        </p>
      ) : (
        <>
          <div className="set-dj-insights__stats">
            <div>
              <strong>{insights.analyzedCount}</strong>
              <span>{lang === 'ru' ? 'с мета' : 'with meta'}</span>
            </div>
            <div>
              <strong>{insights.avgBpm ?? '—'}</strong>
              <span>{lang === 'ru' ? 'ср. BPM' : 'avg BPM'}</span>
            </div>
            <div>
              <strong>{insights.highlight?.label ?? '—'}</strong>
              <span>{lang === 'ru' ? 'лучший переход' : 'best transition'}</span>
            </div>
            {insights.riskyCount > 0 && (
              <div className="set-dj-insights__stat-warn">
                <strong>{insights.riskyCount}</strong>
                <span>{lang === 'ru' ? 'рискованных' : 'risky hops'}</span>
              </div>
            )}
          </div>

          <div className="set-dj-insights__bpm" aria-hidden>
            <span className="set-dj-insights__bpm-label">BPM</span>
            <div className="set-dj-insights__bpm-bars">
              {insights.bpmSeries.map((e) => (
                <span
                  key={`${e.index}-${e.camelotKey}`}
                  className="set-dj-insights__bpm-bar"
                  style={{ height: `${Math.max(12, (e.bpm / maxBpm) * 100)}%` }}
                  title={`${e.title} · ${e.bpm} · ${e.camelotKey}`}
                />
              ))}
            </div>
          </div>

          <div className="set-dj-insights__keys">
            {Object.entries(insights.keyCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <span key={key} className="set-dj-insights__key-chip">
                  <strong>{key}</strong>
                  <span>{count}</span>
                </span>
              ))}
          </div>

          {insights.transitions.length > 0 && (
            <ul className="set-dj-insights__transitions" data-testid="set-dj-transitions">
              {insights.transitions.map((tr) => (
                <li
                  key={`${tr.from.index}-${tr.to.index}`}
                  className={`set-dj-insights__transition-row set-dj-insights__transition-row--${tr.quality}`}
                >
                  <span className="set-dj-insights__transition-keys">{tr.label}</span>
                  <span className="set-dj-insights__transition-bpm">
                    {tr.from.bpm} → {tr.to.bpm} BPM
                  </span>
                  <span className="set-dj-insights__transition-quality">{L[tr.quality]}</span>
                </li>
              ))}
            </ul>
          )}

          {insights.highlight && (
            <p className="set-dj-insights__transition">
              {lang === 'ru' ? 'Гармоничный переход' : 'Harmonic transition'}
              {' '}
              <strong>{insights.highlight.label}</strong>
              {' '}
              ({insights.highlight.from.bpm} → {insights.highlight.to.bpm} BPM · {L[insights.highlight.quality]})
            </p>
          )}
        </>
      )}
    </section>
  );
}
