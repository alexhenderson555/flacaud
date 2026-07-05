import { Disc3 } from 'lucide-react';

/**
 * DJ analysis (BPM/key) toggle card.
 * Extracted from Account.jsx.
 */
export default function DjAnalysisCard({
  t,
  isLoggedIn,
  djFeaturesAvailable,
  djAnalysisEnabled,
  onToggle,
}) {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '24px',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: isLoggedIn && djFeaturesAvailable ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(156, 39, 176, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ce93d8',
          }}
        >
          <Disc3 size={24} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('djAnalysis')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {djFeaturesAvailable ? t('djAnalysisDesc') : t('djPlanRequired')}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={!isLoggedIn || !djFeaturesAvailable}
        onClick={onToggle}
        style={{
          width: '48px',
          height: '28px',
          borderRadius: '14px',
          background: djAnalysisEnabled && djFeaturesAvailable ? 'var(--accent-solid)' : 'var(--bg-surface-hover)',
          border: 'none',
          cursor: isLoggedIn && djFeaturesAvailable ? 'pointer' : 'not-allowed',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'var(--control-knob)',
            position: 'absolute',
            top: '4px',
            left: djAnalysisEnabled && djFeaturesAvailable ? '24px' : '4px',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}
