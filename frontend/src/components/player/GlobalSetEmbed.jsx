import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import LazySetPlayer from '../LazySetPlayer';
import { usePlayer } from '../../store/usePlayerStore';
import { SOUND_CLOUD_EMBED_HEIGHT } from '../../utils/setEmbedUrl';

function isSoundCloudUrl(url) {
  return /soundcloud\.com|snd\.sc/i.test(url || '');
}

// Pages with their own SetEmbedAnchor host a full-size inline player while
// you're on them; the embed only shrinks into the floating corner dock once
// you navigate elsewhere (so it keeps playing without hogging every page).
const EMBED_INLINE_PATHS = new Set(['/sets', '/set-library', '/analyzer', '/set-browser']);

export default function GlobalSetEmbed() {
  const location = useLocation();
  const {
    embedUrl,
    embedPlaying,
    embedEngaged,
    currentTrack,
    isPlaying,
    isLoading,
    setAudioMode,
    setAudioRef,
    setAudioSrc,
    anchorEl,
    setEmbedPlayerRef: playerRef,
    resumeSetEmbed,
    releaseSetEmbed,
    handleEmbedReady,
    handleEmbedPlay,
    handleEmbedPause,
    handleSetAudioReady,
    handleSetAudioTimeUpdate,
    handleSetAudioLoadedMetadata,
  } = usePlayer();

  const onInlinePage = EMBED_INLINE_PATHS.has(location.pathname);
  const inlineAnchored = onInlinePage && !!anchorEl;
  /** Keep dock while session is engaged (playing or paused) off inline pages. */
  const showDock = !!embedUrl && embedEngaged && !inlineAnchored && !setAudioMode;
  const visible = !!embedUrl && !setAudioMode && (inlineAnchored || showDock);
  const isSc = isSoundCloudUrl(embedUrl);

  // The player's DOM node is portaled to document.body exactly once and never
  // reparented again after that — moving a live <iframe> to a different DOM
  // parent makes the browser reload it from scratch (YouTube/SoundCloud
  // restarts from 0:00). Instead of re-parenting between "inline" and "dock"
  // containers, we keep a single fixed-position box and just move/resize it
  // with CSS to visually match either the inline anchor's rect or the corner.
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!inlineAnchored) {
      setRect(null);
      return undefined;
    }
    // Coalesced into rAF so a fast/inertial scroll can't queue more state
    // updates than the browser can paint — without this, the fixed-position
    // box (synced from the anchor's rect, since it can't live in normal
    // document flow without breaking the no-reparent trick above) visibly
    // lags a render behind the anchor and "catches up" in a jerky snap.
    let rafId = null;
    const update = () => {
      rafId = null;
      const r = anchorEl.getBoundingClientRect();
      setRect({
        top: r.top, left: r.left, width: r.width, height: r.height,
      });
    };
    const scheduleUpdate = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(update);
    };
    scheduleUpdate();
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(anchorEl);
    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [inlineAnchored, anchorEl]);

  useEffect(() => {
    document.documentElement.classList.toggle('set-embed-dock-visible', showDock);
    return () => document.documentElement.classList.remove('set-embed-dock-visible');
  }, [showDock]);

  const prevModeRef = useRef(inlineAnchored ? 'inline' : (showDock ? 'dock' : 'none'));
  useEffect(() => {
    const mode = inlineAnchored ? 'inline' : (showDock ? 'dock' : 'none');
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    const mainPlaybackActive = !!currentTrack && (isPlaying || isLoading);
    if (embedPlaying && prev === 'inline' && mode === 'dock' && !mainPlaybackActive) {
      const id = window.setTimeout(() => resumeSetEmbed?.(), 500);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [inlineAnchored, showDock, embedPlaying, resumeSetEmbed, currentTrack, isPlaying, isLoading]);

  const onEmbedReady = useCallback(() => {
    handleEmbedReady?.();
    const mainPlaybackActive = !!currentTrack && (isPlaying || isLoading);
    if (embedPlaying && showDock && !mainPlaybackActive) {
      resumeSetEmbed?.();
    }
  }, [handleEmbedReady, embedPlaying, showDock, resumeSetEmbed, currentTrack, isPlaying, isLoading]);

  const cachedAudio = setAudioMode && setAudioSrc ? (
    <audio
      ref={setAudioRef}
      src={setAudioSrc}
      preload="auto"
      playsInline
      data-testid="set-cached-audio"
      onLoadedMetadata={handleSetAudioLoadedMetadata}
      onCanPlay={handleSetAudioReady}
      onTimeUpdate={handleSetAudioTimeUpdate}
      onPlay={handleEmbedPlay}
      onPause={handleEmbedPause}
      style={{ display: 'none' }}
    />
  ) : null;

  // Stays mounted whenever there's an embed session at all — visibility/position
  // is purely CSS on the wrapping box below, so switching between inline and
  // dock never unmounts (and never re-parents) this player.
  const player = embedUrl && !setAudioMode ? (
    <LazySetPlayer
      ref={playerRef}
      src={embedUrl}
      width="100%"
      height={isSc ? SOUND_CLOUD_EMBED_HEIGHT : '100%'}
      playing={embedPlaying}
      onReady={onEmbedReady}
      onPlay={handleEmbedPlay}
      onPause={handleEmbedPause}
      fallback={(
        <div
          className="set-embed-loading"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: isSc ? SOUND_CLOUD_EMBED_HEIGHT : '100%',
            minHeight: isSc ? SOUND_CLOUD_EMBED_HEIGHT : 180,
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 size={28} className="spin" />
        </div>
      )}
    />
  ) : null;

  const inlineStyle = rect ? {
    position: 'fixed',
    top: 0,
    left: 0,
    width: rect.width,
    height: rect.height,
    // transform instead of top/left: the compositor can move this on its own
    // thread without a main-thread layout pass, so it tracks the scroll
    // gesture smoothly instead of trailing a render behind it.
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    borderRadius: '16px',
    overflow: 'hidden',
    background: '#000',
    zIndex: 60,
  } : undefined;

  return (
    <>
      {cachedAudio}
      {createPortal(
        <div
          className={rect ? undefined : 'set-embed-dock'}
          data-testid="set-embed-dock"
          aria-hidden={!visible}
          hidden={!visible}
          style={visible ? (inlineStyle || { height: isSc ? SOUND_CLOUD_EMBED_HEIGHT : undefined, aspectRatio: isSc ? undefined : '16/9' }) : undefined}
        >
          {showDock && (
            <button
              type="button"
              className="set-embed-dock__close"
              onClick={releaseSetEmbed}
              aria-label="Close"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
          {player}
        </div>,
        document.body,
      )}
    </>
  );
}
