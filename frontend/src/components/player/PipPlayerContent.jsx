import { Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';

const btnStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--player-text, #fff)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

/** Rendered via a portal into the Document Picture-in-Picture window (see
 * usePipWindow.js) -- kept deliberately minimal (no dropdowns/overlays) since
 * it lives in a small, always-on-top floating window meant to be glanced at
 * while something else (a fullscreen game) has focus. */
export default function PipPlayerContent({
  currentTrack,
  isPlaying,
  isLoading,
  togglePlay,
  playPrevious,
  playNext,
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

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 10, padding: '12px 16px', boxSizing: 'border-box',
        background: 'var(--bg-dark, #0a0a0a)', color: 'var(--player-text, #fff)',
        fontFamily: 'inherit', userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
        <img
          src={coverImgSrc(currentTrack.cover_url)}
          alt=""
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          >
            {currentTrack.title}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--player-text-muted, #999)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          >
            {artists}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button type="button" onClick={() => playPrevious?.()} style={btnStyle} aria-label="Previous">
          <SkipBack size={20} />
        </button>
        <button
          type="button"
          onClick={() => togglePlay?.(currentTrack)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            ...btnStyle,
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--player-text, #fff)', color: 'var(--bg-dark, #0a0a0a)',
          }}
        >
          {isLoading ? <Loader2 size={18} className="spin" /> : (
            isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />
          )}
        </button>
        <button type="button" onClick={() => playNext?.()} style={btnStyle} aria-label="Next">
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}
