import { Activity } from 'lucide-react';
import { usePlayer } from '../../store/usePlayerStore';

/**
 * Background visualizer toggle + sensitivity/smoothing sliders.
 * Extracted from Account.jsx to reduce its size.
 */
export default function VisualizerCard({ t, lang, visualizerEnabled, setVisualizerEnabled }) {
  const visualSensitivity = usePlayer((s) => s.visualSensitivity) ?? 1.0;
  const setVisualSensitivity = usePlayer((s) => s.setVisualSensitivity);
  const visualSmoothing = usePlayer((s) => s.visualSmoothing) ?? 0.5;
  const setVisualSmoothing = usePlayer((s) => s.setVisualSmoothing);

  return (
    <div className="glass-panel settings-panel" style={{ flexWrap: 'wrap', gap: '20px' }}>
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="settings-panel__header" style={{ marginBottom: 0 }}>
          <div
            className="settings-panel__icon"
            style={{
              background: 'rgba(37, 117, 252, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-solid)',
            }}
          >
            <Activity size={24} />
          </div>
          <div>
            <h3 className="settings-panel__title">{t('bgVis')}</h3>
            <p className="settings-panel__desc">{t('bgDesc')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisualizerEnabled(!visualizerEnabled)}
          className={`settings-pill-btn${visualizerEnabled ? ' settings-pill-btn--on' : ' settings-pill-btn--off'}`}
          style={{ flexShrink: 0 }}
        >
          {visualizerEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {visualizerEnabled && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '8px', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                {lang === 'ru' ? 'Чувствительность к биту' : 'Beat Sensitivity'}
              </label>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{visualSensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={visualSensitivity}
              onChange={(e) => setVisualSensitivity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-solid)' }}
            />
            <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {lang === 'ru' ? 'Выше = анимации дергаются сильнее даже на тихих треках.' : 'Higher = more reactive animations even on quiet tracks.'}
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                {lang === 'ru' ? 'Сглаживание (Плавность)' : 'Animation Smoothing'}
              </label>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{Math.round(visualSmoothing * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={visualSmoothing}
              onChange={(e) => setVisualSmoothing(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-solid)' }}
            />
            <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {lang === 'ru' ? 'Меньше = резкие скачки. Больше = плавные, как желе, переходы.' : 'Lower = sharp jumps. Higher = fluid jelly-like motion.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
