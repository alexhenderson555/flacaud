import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import LazySetPlayer from '../LazySetPlayer';
import { usePlayer } from '../../store/usePlayerStore';
import { SOUND_CLOUD_EMBED_HEIGHT } from '../../utils/setEmbedUrl';

function isSoundCloudUrl(url) {
  return /soundcloud\.com|snd\.sc/i.test(url || '');
}

const EMBED_INLINE_PATHS = new Set(['/analyzer', '/sets', '/set-library', '/set-browser']);

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
    playerRef,
    resumeSetEmbed,
    handleEmbedReady,
    handleEmbedPlay,
    handleEmbedPause,
    handleSetAudioReady,
    handleSetAudioTimeUpdate,
    handleSetAudioLoadedMetadata,
  } = usePlayer();

  const [dockHost, setDockHost] = useState(null);
  const onDockRef = useCallback((el) => {
    setDockHost(el || null);
  }, []);

  const onInlinePage = EMBED_INLINE_PATHS.has(location.pathname);
  const inlineAnchored = onInlinePage && anchorEl;
  /** Keep dock while session is engaged (playing or paused) off inline pages. */
  const showDock = !!embedUrl && embedEngaged && !inlineAnchored && !setAudioMode;
  const portalTarget = inlineAnchored ? anchorEl : (showDock ? dockHost : null);
  const isSc = isSoundCloudUrl(embedUrl);

  useEffect(() => {
    document.documentElement.classList.toggle('set-embed-dock-visible', showDock);
    return () => document.documentElement.classList.remove('set-embed-dock-visible');
  }, [showDock]);

  const prevTargetKindRef = useRef(inlineAnchored ? 'inline' : (showDock ? 'dock' : 'none'));
  useEffect(() => {
    const kind = inlineAnchored ? 'inline' : (showDock ? 'dock' : 'none');
    const prev = prevTargetKindRef.current;
    prevTargetKindRef.current = kind;
    const mainPlaybackActive = !!currentTrack && (isPlaying || isLoading);
    if (embedPlaying && prev === 'inline' && kind === 'dock' && !mainPlaybackActive) {
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

  const player = embedUrl && portalTarget && !setAudioMode ? (
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

  return (
    <>
      {cachedAudio}
      <div
        ref={onDockRef}
        className="set-embed-dock"
        data-testid="set-embed-dock"
        aria-hidden={!showDock}
        hidden={!showDock}
      />
      {player && portalTarget ? createPortal(player, portalTarget) : null}
    </>
  );
}

