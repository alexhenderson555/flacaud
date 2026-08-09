import PlatformIcon from '../sync/PlatformIcon';
import {
  Play, SkipBack, SkipForward, Volume2, Maximize2, Shuffle, Download,
} from 'lucide-react';

const DEMO_TRACKS = [
  { title: 'GLUE', artist: 'BICEP', duration: 269, cover: 1, initials: 'GL' },
  { title: 'leavemealone', artist: 'Fred again..', duration: 221, cover: 2, initials: 'LA' },
  { title: 'Good Lies', artist: 'Overmono', duration: 167, cover: 3, initials: 'GL' },
];

const LIBRARY_TRACKS = [
  { title: 'It Goes Like (Nanana)', artist: 'Peggy Gou', duration: 231, cover: 1, initials: 'IG', bpm: '130', key: '9A' },
  { title: 'Push Up', artist: 'Creeds', duration: 140, cover: 2, initials: 'PU', bpm: '160', key: '4A' },
  { title: 'Rumble', artist: 'Skrillex', duration: 146, cover: 3, initials: 'RU', bpm: '140', key: '1A' },
];

const DISCOVER_TRACKS = [
  { title: 'So U Kno', artist: 'Overmono', duration: 214, cover: 2, initials: 'OV' },
  { title: 'Free (Powder Edit)', artist: 'Fred again..', duration: 198, cover: 1, initials: 'FR' },
  { title: 'Where You Are', artist: 'Bicep', duration: 245, cover: 3, initials: 'WY' },
];

const DJ_TRACKS = [
  { time: '00:00', title: 'GLUE', artist: 'BICEP', duration: 269, cover: 1, initials: 'GL', bpm: '130', key: '8A' },
  { time: '04:12', title: 'Good Lies', artist: 'Overmono', duration: 167, cover: 3, initials: 'GL', bpm: '130', key: '8A' },
  { time: '08:45', title: 'leavemealone', artist: 'Fred again..', duration: 221, cover: 2, initials: 'LA', bpm: '132', key: '9A' },
];

function formatDur(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function ShowcaseCover({ variant = 1, initials, className = '' }) {
  return (
    <div
      className={`landing-preview__row-cover landing-preview__row-cover--${variant} ${className}`.trim()}
      data-initials={initials}
      aria-hidden
    />
  );
}

function ShowcaseTrackRow({
  title,
  artist,
  duration,
  cover = 1,
  initials,
  trailing,
  subline,
}) {
  return (
    <div className="landing-preview__row glass-panel">
      <ShowcaseCover variant={cover} initials={initials} />
      <div className="landing-preview__row-meta">
        <strong>{title}</strong>
        <span>{subline || artist}</span>
      </div>
      {duration != null && (
        <span className="landing-preview__row-mid">{formatDur(duration)}</span>
      )}
      <div className="landing-preview__row-end">{trailing}</div>
    </div>
  );
}

function ShowcaseMiniPlayer({ title, artist, cover = 1, initials, current = '01:24', total = '04:29' }) {
  return (
    <div className="landing-preview__mini-player glass-panel">
      <div className="landing-preview__mini-track">
        <ShowcaseCover variant={cover} initials={initials} className="landing-preview__mini-cover" />
        <div className="landing-preview__mini-meta">
          <strong>{title}</strong>
          <span>{artist}</span>
        </div>
      </div>
      <div className="landing-preview__mini-center">
        <div className="landing-preview__mini-controls">
          <SkipBack size={14} />
          <button type="button" className="landing-preview__mini-play" aria-label="Play preview">
            <Play size={14} fill="currentColor" />
          </button>
          <SkipForward size={14} />
        </div>
        <div className="landing-preview__mini-time">
          <span>{current}</span>
          <div className="landing-preview__mini-progress">
            <span />
          </div>
          <span>{total}</span>
        </div>
      </div>
      <div className="landing-preview__mini-right">
        <Volume2 size={14} />
        <div className="landing-preview__mini-volume">
          <span />
        </div>
        <Maximize2 size={14} />
      </div>
    </div>
  );
}

function ShowcasePanelShell({ title, badge, toolbar, footer, children, miniPlayer }) {
  return (
    <div className="landing-preview">
      <div className="landing-preview__head">
        <h3>{title}</h3>
        {badge ? <span className="landing-preview__badge">{badge}</span> : null}
      </div>
      <div className="landing-preview__toolbar">{toolbar}</div>
      <div className="landing-preview__list-wrap">{children}</div>
      <div className={`landing-preview__footer${footer ? '' : ' landing-preview__footer--spacer'}`}>
        {footer}
      </div>
      {miniPlayer}
    </div>
  );
}

export function TransferPanel({ lang }) {
  const rows = DEMO_TRACKS.map((r, i) => ({ ...r, ok: i < 2 }));

  return (
    <ShowcasePanelShell
      title={lang === 'ru' ? 'Перенос плейлиста' : 'Playlist transfer'}
      badge={lang === 'ru' ? 'Предпросмотр' : 'Preview'}
      toolbar={(
        <>
          <div className="landing-preview__url-row">
            <div className="landing-preview__platforms">
              {['spotify', 'ytmusic', 'apple'].map((p) => (
                <span key={p} className="landing-preview__platform">
                  <PlatformIcon id={p} size={14} />
                </span>
              ))}
            </div>
            <div className="landing-preview__input">
              open.spotify.com/playlist/37i9dQZF1DX…
            </div>
          </div>
          <div className="landing-preview__stats landing-preview__stats--compact">
            <div>
              <strong>24</strong>
              <span>{lang === 'ru' ? 'найдено' : 'found'}</span>
            </div>
            <div>
              <strong>24</strong>
              <span>{lang === 'ru' ? 'выбрано' : 'selected'}</span>
            </div>
            <div>
              <strong>1.2 ГБ</strong>
              <span>{lang === 'ru' ? 'размер' : 'size'}</span>
            </div>
          </div>
        </>
      )}
      footer={(
        <span className="landing-preview__btn landing-preview__btn--primary">
          {lang === 'ru' ? 'Импортировать' : 'Import'}
        </span>
      )}
      miniPlayer={(
        <ShowcaseMiniPlayer
          title="GLUE"
          artist="BICEP"
          cover={1}
          initials="GL"
          current="01:24"
          total="04:29"
        />
      )}
    >
      {rows.map((r) => (
        <ShowcaseTrackRow
          key={r.title}
          title={r.title}
          artist={r.artist}
          duration={r.duration}
          cover={r.cover}
          initials={r.initials}
          trailing={<input type="checkbox" readOnly checked={r.ok} className="landing-preview__track-check" />}
        />
      ))}
    </ShowcasePanelShell>
  );
}

export function LibraryPanel({ lang }) {
  return (
    <ShowcasePanelShell
      title={lang === 'ru' ? 'Медиатека' : 'Library'}
      badge={`128 ${lang === 'ru' ? 'треков' : 'tracks'}`}
      toolbar={(
        // Matches the real Library toolbar (Play All / Shuffle Play / Download
        // All) -- not filter chips, which don't exist inline there (BPM/Camelot
        // are behind a separate "DJ filters" toggle).
        <div className="landing-preview__filters">
          <span
            className="landing-preview__btn landing-preview__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Play size={12} fill="currentColor" />
            {lang === 'ru' ? 'Играть всё' : 'Play All'}
          </span>
          <span
            className="landing-preview__btn landing-preview__btn--ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Shuffle size={12} />
            {lang === 'ru' ? 'Перемешать' : 'Shuffle'}
          </span>
          <span
            className="landing-preview__btn landing-preview__btn--ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Download size={12} />
            {lang === 'ru' ? 'Скачать всё' : 'Download All'}
          </span>
        </div>
      )}
      miniPlayer={(
        <ShowcaseMiniPlayer
          title="It Goes Like (Nanana)"
          artist="Peggy Gou"
          cover={1}
          initials="IG"
          current="01:24"
          total="03:51"
        />
      )}
    >
      {LIBRARY_TRACKS.map((tr) => (
        <ShowcaseTrackRow
          key={tr.title}
          title={tr.title}
          artist={tr.artist}
          duration={tr.duration}
          cover={tr.cover}
          initials={tr.initials}
          trailing={(
            <div className="landing-preview__row-tags">
              <span>{tr.bpm} BPM</span>
              <span>{tr.key}</span>
            </div>
          )}
        />
      ))}
    </ShowcasePanelShell>
  );
}

export function DjPanel({ lang }) {
  const bpmBars = [118, 122, 124, 126, 128, 126, 124, 130, 128, 126];

  return (
    <ShowcasePanelShell
      title={lang === 'ru' ? 'DJ-разбор сета' : 'Set DJ insights'}
      badge={`48 ${lang === 'ru' ? 'треков' : 'tracks'}`}
      toolbar={(
        <>
          <div className="landing-preview__dj-summary landing-preview__dj-summary--compact">
            <div>
              <strong>36</strong>
              <span>{lang === 'ru' ? 'с мета' : 'with meta'}</span>
            </div>
            <div>
              <strong>126</strong>
              <span>{lang === 'ru' ? 'ср. BPM' : 'avg BPM'}</span>
            </div>
            <div>
              <strong>9A→10A</strong>
              <span>{lang === 'ru' ? 'переход' : 'transition'}</span>
            </div>
          </div>
          <div className="landing-preview__wave landing-preview__wave--bpm landing-preview__wave--compact" aria-hidden>
            {bpmBars.map((h, i) => (
              <span key={i} style={{ '--h': `${(h / 132) * 100}%` }} />
            ))}
          </div>
        </>
      )}
      miniPlayer={(
        <ShowcaseMiniPlayer
          title="GLUE"
          artist="BICEP"
          cover={1}
          initials="GL"
          current="01:24"
          total="04:29"
        />
      )}
    >
      {DJ_TRACKS.map((tr) => (
        <ShowcaseTrackRow
          key={tr.title}
          title={tr.title}
          artist={tr.artist}
          duration={tr.duration}
          cover={tr.cover}
          initials={tr.initials}
          subline={`${tr.time} · ${tr.artist}`}
          trailing={(
            <div className="landing-preview__row-tags">
              <span>{tr.bpm} BPM</span>
              <span>{tr.key}</span>
            </div>
          )}
        />
      ))}
    </ShowcasePanelShell>
  );
}

export function DiscoverPanel({ lang }) {
  return (
    <ShowcasePanelShell
      title={lang === 'ru' ? 'Поиск и радио' : 'Discover'}
      badge={lang === 'ru' ? 'Afro House радио' : 'Afro House radio'}
      toolbar={(
        <>
          <div className="landing-preview__url-row">
            <div className="landing-preview__input">
              {lang === 'ru' ? 'Слушаю… ищу совпадение по звуку' : 'Listening… matching by audio'}
            </div>
          </div>
          <div className="landing-preview__filters">
            <span className="landing-preview__filter landing-preview__filter--on">Afro House</span>
            <span className="landing-preview__filter">Deep House</span>
            <span className="landing-preview__filter">Melodic Techno</span>
          </div>
        </>
      )}
      footer={(
        <span className="landing-preview__btn landing-preview__btn--primary">
          {lang === 'ru' ? 'Загрузить ещё' : 'Load more'}
        </span>
      )}
      miniPlayer={(
        <ShowcaseMiniPlayer
          title="So U Kno"
          artist="Overmono"
          cover={2}
          initials="OV"
          current="00:47"
          total="03:34"
        />
      )}
    >
      {DISCOVER_TRACKS.map((tr) => (
        <ShowcaseTrackRow
          key={tr.title}
          title={tr.title}
          artist={tr.artist}
          duration={tr.duration}
          cover={tr.cover}
          initials={tr.initials}
        />
      ))}
    </ShowcasePanelShell>
  );
}
