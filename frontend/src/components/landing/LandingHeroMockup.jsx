import { Play, SkipBack, SkipForward, Volume2, Maximize2 } from 'lucide-react';

const ROWS = [
  { title: 'GLUE', artist: 'BICEP', duration: 269, cover: 1, initials: 'GL' },
  { title: 'leavemealone', artist: 'Fred again..', duration: 221, cover: 2, initials: 'LA' },
  { title: 'Good Lies', artist: 'Overmono', duration: 167, cover: 3, initials: 'GL' },
];

function HeroCover({ variant, initials, className = '' }) {
  return (
    <div
      className={`landing-preview__row-cover landing-preview__row-cover--${variant} ${className}`.trim()}
      data-initials={initials}
      aria-hidden
    />
  );
}

/** Pure-CSS product preview for marketing hero. */
export default function LandingHeroMockup({ lang, flat = false }) {
  return (
    <div className={`landing-mockup${flat ? ' landing-mockup--flat' : ''}`} aria-hidden>
      <div className="landing-mockup__chrome">
        <span className="landing-mockup__dot" />
        <span className="landing-mockup__dot" />
        <span className="landing-mockup__dot" />
        <span className="landing-mockup__url">flacaud.ru/sync</span>
      </div>
      <div className="landing-mockup__panel" style={{ padding: '16px', background: 'var(--bg-card)' }}>
        <div className="landing-mockup__panel-head" style={{ marginBottom: '16px' }}>
          <span>{lang === 'ru' ? 'Перенос плейлиста' : 'Playlist transfer'}</span>
          <span className="landing-mockup__pill">FLAC</span>
        </div>
        <div className="landing-hero-preview__list">
          {ROWS.map((r) => (
            <div key={r.title} className="landing-hero-preview__row glass-panel">
              <HeroCover variant={r.cover} initials={r.initials} className="landing-hero-preview__cover" />
              <div className="landing-hero-preview__meta">
                <strong>{r.title}</strong>
                <span>{r.artist}</span>
              </div>
              <span className="landing-hero-preview__dur">
                {Math.floor(r.duration / 60)}:{String(r.duration % 60).padStart(2, '0')}
              </span>
              <input type="checkbox" readOnly checked className="landing-hero-preview__check" />
            </div>
          ))}
        </div>

        <div className="landing-hero-preview__player glass-panel">
          <div className="landing-hero-preview__player-track">
            <HeroCover variant={1} initials="GL" className="landing-hero-preview__player-cover" />
            <div className="landing-hero-preview__player-meta">
              <span className="landing-hero-preview__player-title">GLUE</span>
              <span className="landing-hero-preview__player-time">01:24</span>
            </div>
          </div>
          <div className="landing-hero-preview__controls">
            <div className="landing-hero-preview__ctrl-row">
              <SkipBack size={18} opacity={0.6} />
              <div className="landing-hero-preview__play">
                <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />
              </div>
              <SkipForward size={18} opacity={0.6} />
            </div>
            <div className="landing-hero-preview__progress">
              <div className="landing-hero-preview__progress-fill" />
            </div>
            <div className="landing-hero-preview__time-row">
              <span>01:24</span>
              <span>04:29</span>
            </div>
          </div>
          <div className="landing-hero-preview__right">
            <Volume2 size={16} />
            <div className="landing-hero-preview__vol">
              <div className="landing-hero-preview__vol-fill" />
            </div>
            <Maximize2 size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
