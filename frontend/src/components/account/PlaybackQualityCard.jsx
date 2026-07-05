import { Settings, Sparkles, AudioLines, Gem, Check, Lock } from 'lucide-react';
import { isQualityAllowedForPlan } from '../../utils/qualityPrefs';

const QUALITY_TIERS = [
  { id: 'HIGH', label: '320k', spec: 'AAC 320 kbps', Icon: AudioLines },
  { id: 'LOSSLESS', label: 'Lossless', spec: 'FLAC (CD on Basic, Hi-Res on Pro)', Icon: Gem },
];

/**
 * Playback quality settings card — auto/manual toggle + tier grid.
 * Extracted from Account.jsx.
 */
export default function PlaybackQualityCard({
  t,
  lang,
  plan,
  autoPlaybackQuality,
  setAutoPlaybackQuality,
  defaultPlaybackQuality,
  setDefaultPlaybackQuality,
  setAuthError,
}) {
  return (
    <div className="glass-panel settings-panel">
      <div className="settings-panel__header">
        <div
          className="settings-panel__icon"
          style={{ background: 'rgba(37, 117, 252, 0.12)', color: 'var(--accent-solid)' }}
        >
          <Settings size={24} />
        </div>
        <div>
          <h3 className="settings-panel__title">{t('defAudio')}</h3>
          <p className="settings-panel__desc">
            {t(autoPlaybackQuality ? 'defAudioAutoDesc' : 'defAudioManualDesc')}
          </p>
        </div>
      </div>

      <div
        className={`quality-auto-card${autoPlaybackQuality ? ' quality-auto-card--active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setAutoPlaybackQuality(!autoPlaybackQuality)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setAutoPlaybackQuality(!autoPlaybackQuality);
        }}
      >
        <div className="quality-auto-card__main">
          <div className="quality-auto-card__badge">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="quality-auto-card__label">{t('defAudioAuto')}</div>
            <div className="quality-auto-card__hint">{t('defAudioAutoDesc')}</div>
          </div>
        </div>
        <button
          type="button"
          className="settings-toggle"
          aria-pressed={autoPlaybackQuality}
          style={{ background: autoPlaybackQuality ? 'var(--accent-solid)' : 'var(--bg-surface-hover)' }}
          onClick={(e) => {
            e.stopPropagation();
            setAutoPlaybackQuality(!autoPlaybackQuality);
          }}
        >
          <div
            className="settings-toggle__knob"
            style={{ left: autoPlaybackQuality ? '24px' : '4px' }}
          />
        </button>
      </div>

      {!autoPlaybackQuality && (
        <>
          <div className="quality-manual-label">{t('defAudioManual')}</div>
          <div className="quality-tier-grid">
            {QUALITY_TIERS.map((q) => {
              const allowed = isQualityAllowedForPlan(q.id, plan);
              const active = defaultPlaybackQuality === q.id;
              const TierIcon = q.Icon;
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`quality-tier-card${active ? ' quality-tier-card--active' : ''}${allowed ? '' : ' quality-tier-card--disabled'}`}
                  disabled={!allowed}
                  onClick={() => {
                    if (!allowed) {
                      setAuthError(
                        lang === 'ru'
                          ? 'Это качество доступно на платном тарифе'
                          : 'This quality requires a paid plan',
                      );
                      return;
                    }
                    setAuthError('');
                    setDefaultPlaybackQuality(q.id);
                  }}
                >
                  <span className="quality-tier-card__top">
                    <span className={`quality-tier-card__icon${active ? ' quality-tier-card__icon--active' : ''}`}>
                      <TierIcon size={18} />
                    </span>
                    <span className={`quality-tier-card__check${active ? ' quality-tier-card__check--on' : ''}`} aria-hidden>
                      {allowed ? <Check size={13} strokeWidth={3} /> : <Lock size={12} />}
                    </span>
                  </span>
                  <span className="quality-tier-card__name">{q.label}</span>
                  <span className="quality-tier-card__spec">{q.spec}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
