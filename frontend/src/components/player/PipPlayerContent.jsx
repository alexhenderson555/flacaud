import { Play, Pause, SkipBack, SkipForward, Loader2, Radio } from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';
import { formatTime } from '../../utils/playerTransportLogic';

const iconBtnStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  width: 34,
  height: 34,
  borderRadius: '50%',
  flexShrink: 0,
};

/** Rendered via a portal into the Document Picture-in-Picture window (see
 * usePipWindow.js) -- a small, always-on-top floating window meant to be
 * glanced at while something else (a fullscreen game) has focus. Styled to
 * match the main player (blurred cover backdrop, accent-gradient play
 * button, the same seek-bar look) rather than a generic flat widget. */
export default function PipPlayerContent({
  currentTrack,
  isPlaying,
  isLoading,
  togglePlay,
  playPrevious,
  playNext,
  progress = 0,
  trackDuration = 0,
  beginSeekScrub,
  handleSeekPreview,
  handleSeekCommit,
  startTrackRadio,
  radioLoadingTrackId = null,
  nextTrack,
  lang = 'en',
}) {
  if (!currentTrack) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--bg-dark, #0a0a0a)',
          color: 'var(--player-text-muted, #888)', fontSize: 13,
        }}
      >
        {lang === 'ru' ? 'Ничего не играет' : 'Nothing playing'}
      </div>
    );
  }

  const artists = (currentTrack.artists || []).join(', ');
  const cover = coverImgSrc(currentTrack.cover_url);
  const seekPct = trackDuration ? `${Math.min(100, (progress / trackDuration) * 100)}%` : '0%';
  const radioLoading = radioLoadingTrackId === String(currentTrack.provider_id);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {cover && (
        <div
          style={{
            position: 'absolute', inset: -24, backgroundImage: `url(${cover})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(28px) brightness(0.5)', transform: 'scale(1.2)',
          }}
        />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.8) 100%)',
      }}
      />
      <div
        style={{
          position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
          height: '100%', boxSizing: 'border-box', padding: '12px 14px 10px', color: '#fff',
          fontFamily: 'inherit', userSelect: 'none', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img
            src={cover}
            alt=""
            style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
          />
          <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTrack.title}
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {artists}
            </div>
          </div>
          {startTrackRadio && (
            <button
              type="button"
              onClick={() => currentTrack && startTrackRadio(currentTrack)}
              disabled={radioLoading}
              title={lang === 'ru' ? 'Радио по треку' : 'Start Track Radio'}
              aria-label={lang === 'ru' ? 'Радио по треку' : 'Start Track Radio'}
              style={iconBtnStyle}
            >
              {radioLoading ? <Loader2 size={15} className="spin" /> : <Radio size={15} />}
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums', width: 30 }}>
            {formatTime(progress)}
          </span>
          <input
            type="range"
            min={0}
            max={trackDuration || 0}
            step={0.1}
            value={trackDuration ? Math.min(progress, trackDuration) : 0}
            disabled={!trackDuration || isLoading}
            onPointerDown={beginSeekScrub}
            onInput={(e) => handleSeekPreview?.(parseFloat(e.target.value))}
            onChange={(e) => handleSeekCommit?.(parseFloat(e.target.value))}
            style={{
              flex: 1, height: 16, margin: 0, appearance: 'none', background: 'transparent', cursor: 'pointer',
              '--seek-pct': seekPct,
            }}
            className="pip-seek-range"
          />
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>
            {formatTime(trackDuration)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <button
            type="button"
            onClick={() => playPrevious?.()}
            aria-label="Previous"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}
          >
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => togglePlay?.(currentTrack)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            style={{
              background: 'var(--accent-gradient, linear-gradient(135deg, #6a11cb, #2575fc))',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: 42, borderRadius: '50%', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            {isLoading ? <Loader2 size={19} className="spin" /> : (
              isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button
            type="button"
            onClick={() => playNext?.()}
            aria-label="Next"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
        </div>

        {nextTrack && (
          <div style={{
            fontSize: 10.5, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', textAlign: 'center',
          }}
          >
            {lang === 'ru' ? 'Далее: ' : 'Up next: '}{nextTrack.title}
          </div>
        )}
      </div>
    </div>
  );
}
