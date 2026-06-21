import { useCallback, useEffect, useRef } from 'react';
import { initAudioEngine, resumeAudioContext } from '../../utils/audioEngine';
import { PRELOAD_ENABLED } from '../../utils/playerConfig';
import { sameStreamResource } from '../../utils/qualityPrefs';

const HIDDEN_AUDIO_STYLE = {
  position: 'absolute',
  width: 0,
  height: 0,
  opacity: 0,
  pointerEvents: 'none',
};

export default function GlobalAudio({
  attachSlotA,
  attachSlotB,
  mainOnSlotA,
  audioRef,
  getMainAudioEl,
  currentAudioSrc,
  currentTrackId,
  preloadAudioSrc,
  isPlaying = false,
  isLoading = false,
  setIsPlaying,
  setIsLoading,
  setProgress,
  playNext,
  restorePendingSeek,
  runFadeIn,
  fadeInPendingRef,
  pendingPlayRef,
  pendingSeekRef,
  skipEndedRef,
  crossfadingRef,
  volume,
  handleStreamError,
  deferPlayUntilReady = false,
}) {
  const losslessReadyRef = useRef(false);
  const losslessStreamPathRef = useRef('');
  const streamErrorAtRef = useRef(0);

  const resolveMainEl = useCallback(
    () => getMainAudioEl?.() ?? audioRef.current,
    [getMainAudioEl, audioRef],
  );

  useEffect(() => {
    const streamPath = (currentAudioSrc || '').split('?')[0] || '';
    if (streamPath !== losslessStreamPathRef.current) {
      losslessReadyRef.current = false;
      losslessStreamPathRef.current = streamPath;
    }
  }, [currentAudioSrc]);

  const holdUntilLosslessReady = useCallback(() => {
    if (!deferPlayUntilReady || losslessReadyRef.current) return false;
    setIsLoading(true);
    return true;
  }, [deferPlayUntilReady, setIsLoading]);

  const tryStartPlayback = useCallback(() => {
    const el = resolveMainEl();
    if (!pendingPlayRef.current || !el) return;
    if (pendingSeekRef.current != null) return;
    if (deferPlayUntilReady && !losslessReadyRef.current) return;
    if (el.error) return;
    if (!currentAudioSrc) return;
    const activeSrc = el.currentSrc || el.src || '';
    if (!activeSrc || !sameStreamResource(activeSrc, currentAudioSrc)) return;
    skipEndedRef.current = false;
    el.volume = volume;
    el
      .play()
      .then(() => {
        pendingPlayRef.current = false;
        setIsPlaying(true);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          // Play request interrupted by a new load request (rapid track switch). Safe to ignore.
          return;
        }
        if (window.__E2E_DISABLE_AUTOSAVE__) {
          pendingPlayRef.current = false;
          setIsPlaying(true);
          setIsLoading(false);
          return;
        }
        pendingPlayRef.current = true;
        setIsLoading(true);
        if (err?.name === 'NotAllowedError') {
          setIsPlaying(false);
          pendingPlayRef.current = false;
        }
      });
  }, [
    resolveMainEl,
    pendingPlayRef,
    pendingSeekRef,
    skipEndedRef,
    setIsPlaying,
    setIsLoading,
    deferPlayUntilReady,
    volume,
    currentAudioSrc,
  ]);

  // Retry when stream URL lands — canplay may have fired before handlers attached (slot swap).
  useEffect(() => {
    if (!currentAudioSrc || !pendingPlayRef.current) return undefined;
    const el = resolveMainEl();
    if (!el || !el.paused) return undefined;

    const kick = () => tryStartPlayback();
    const raf = requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 80);
    const t2 = setTimeout(kick, 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentAudioSrc, resolveMainEl, pendingPlayRef, tryStartPlayback]);

  // Cached stream / rapid track switch: src unchanged but user still wants play.
  useEffect(() => {
    if (!pendingPlayRef.current) return undefined;
    if (crossfadingRef?.current) return undefined;
    const el = resolveMainEl();
    if (!el || !el.paused) return undefined;
    if (pendingSeekRef.current != null) return undefined;
    if (!currentAudioSrc) return undefined;
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return undefined;

    const kick = () => tryStartPlayback();
    const raf = requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 80);
    const t2 = setTimeout(kick, 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    currentTrackId,
    currentAudioSrc,
    resolveMainEl,
    pendingPlayRef,
    pendingSeekRef,
    crossfadingRef,
    tryStartPlayback,
  ]);

  // UI/audio desync: intended play but element still paused after track switch.
  useEffect(() => {
    if (crossfadingRef?.current) return undefined;
    const el = resolveMainEl();
    if (!el || !el.paused) return undefined;
    if (el.error) return undefined;
    if (Date.now() - streamErrorAtRef.current < 2000) return undefined;
    if (pendingSeekRef.current != null) return undefined;
    if (!currentAudioSrc) return undefined;
    const elSrc = el.currentSrc || el.src || '';
    if (elSrc && !sameStreamResource(elSrc, currentAudioSrc)) return undefined;
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return undefined;
    if (!pendingPlayRef.current && !isPlaying) return undefined;

    pendingPlayRef.current = true;
    setIsLoading(true);
    const kick = () => tryStartPlayback();
    const raf = requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
    };
  }, [
    isPlaying,
    currentAudioSrc,
    currentTrackId,
    resolveMainEl,
    pendingPlayRef,
    pendingSeekRef,
    crossfadingRef,
    tryStartPlayback,
    setIsLoading,
  ]);

  // Sync element src when React stream URL updated (Web Audio slot keeps stale blob until React commits).
  useEffect(() => {
    if (!currentAudioSrc) return undefined;
    const el = resolveMainEl();
    if (!el) return undefined;
    const elSrc = el.currentSrc || el.src || '';
    if (elSrc && sameStreamResource(elSrc, currentAudioSrc)) return undefined;
    try {
      el.src = currentAudioSrc;
      // load() after createMediaElementSource breaks seek — src assignment alone reloads.
    } catch {
      /* ignore */
    }
    return undefined;
  }, [currentAudioSrc, currentTrackId, resolveMainEl]);
  useEffect(() => {
    if (currentAudioSrc || crossfadingRef?.current) return undefined;
    if (!isPlaying && !isLoading) return undefined;
    if (pendingPlayRef.current) return undefined;
    setIsPlaying(false);
    setIsLoading(false);
    return undefined;
  }, [currentAudioSrc, isPlaying, isLoading, crossfadingRef, pendingPlayRef, setIsPlaying, setIsLoading]);

  const restoreIfPending = useCallback((opts = {}) => {
    if (pendingSeekRef.current != null) restorePendingSeek(opts);
  }, [pendingSeekRef, restorePendingSeek]);

  const onMediaReady = useCallback(() => {
    if (holdUntilLosslessReady()) return;
    const el = resolveMainEl();
    const waitingToPlay = pendingPlayRef.current;
    if (waitingToPlay && el && el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setIsLoading(true);
      return;
    }
    restoreIfPending({ allowPlay: true });
    if (fadeInPendingRef.current) {
      runFadeIn();
    } else if (el) {
      el.volume = volume;
    }
    tryStartPlayback();
    if (!pendingPlayRef.current) {
      setIsLoading(false);
    }
  }, [
    holdUntilLosslessReady,
    setIsLoading,
    restoreIfPending,
    fadeInPendingRef,
    runFadeIn,
    resolveMainEl,
    volume,
    tryStartPlayback,
  ]);

  const onFullBufferReady = useCallback(() => {
    losslessReadyRef.current = true;
    restoreIfPending({ allowPlay: true });
    if (fadeInPendingRef.current) {
      runFadeIn();
    } else {
      const el = resolveMainEl();
      if (el) el.volume = volume;
    }
    tryStartPlayback();
    if (!pendingPlayRef.current) {
      setIsLoading(false);
    }
  }, [
    setIsLoading,
    restoreIfPending,
    fadeInPendingRef,
    runFadeIn,
    resolveMainEl,
    volume,
    tryStartPlayback,
  ]);

  const mainHandlers = {
    onPlay: () => {
      if (holdUntilLosslessReady()) return;
      initAudioEngine(audioRef);
      setIsPlaying(true);
      const el = resolveMainEl();
      if (!el || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        setIsLoading(true);
      }
    },
    onPause: () => {
      if (pendingPlayRef.current) return;
      setIsPlaying(false);
      const el = resolveMainEl();
      if (el) setProgress(el.currentTime || 0);
    },
    onSeeking: () => {
      skipEndedRef.current = true;
    },
    onSeeked: () => {
      skipEndedRef.current = false;
      const el = resolveMainEl();
      if (el) setProgress(el.currentTime || 0);
    },
    onEnded: () => {
      if (crossfadingRef?.current) return;
      if (skipEndedRef.current) {
        skipEndedRef.current = false;
        return;
      }
      playNext();
    },
    onWaiting: () => {
      const el = resolveMainEl();
      if (el?.seeking) return;
      setIsLoading(true);
    },
    onStalled: () => {
      const el = resolveMainEl();
      if (el?.seeking) return;
      setIsLoading(true);
    },
    onProgress: () => {
      const el = resolveMainEl();
      if (!el || el.paused || !Number.isFinite(el.duration)) return;
      let bufferedEnd = 0;
      for (let i = 0; i < el.buffered.length; i += 1) {
        bufferedEnd = Math.max(bufferedEnd, el.buffered.end(i));
      }
      if (
        bufferedEnd - el.currentTime < 2
        && el.networkState === HTMLMediaElement.NETWORK_IDLE
        && !el.paused
      ) {
        el.play().catch(() => {});
      }
    },
    onPlaying: () => {
      resumeAudioContext();
      const el = resolveMainEl();
      if (el) el.volume = volume;
      if (holdUntilLosslessReady()) return;
      setIsLoading(false);
      setIsPlaying(true);
    },
    onTimeUpdate: () => {
      const el = resolveMainEl();
      if (!el || el.paused) return;
      if ((el.currentTime || 0) > 0.05) {
        setIsLoading(false);
      }
    },
    onCanPlay: () => {
      if (deferPlayUntilReady) {
        holdUntilLosslessReady();
        return;
      }
      onMediaReady();
    },
    onLoadedData: () => {
      if (deferPlayUntilReady) {
        holdUntilLosslessReady();
        return;
      }
      onMediaReady();
    },
    onLoadedMetadata: () => {
      restoreIfPending({ allowPlay: !deferPlayUntilReady });
      requestAnimationFrame(() => restoreIfPending({ allowPlay: !deferPlayUntilReady }));
      if (!deferPlayUntilReady) {
        tryStartPlayback();
      }
      if (window.__E2E_DISABLE_AUTOSAVE__ && pendingPlayRef.current) {
        pendingPlayRef.current = false;
        setIsPlaying(true);
        setIsLoading(false);
      }
    },
    onDurationChange: () => {
      restoreIfPending({ allowPlay: !deferPlayUntilReady });
    },
    onCanPlayThrough: () => {
      if (deferPlayUntilReady) {
        onFullBufferReady();
      } else {
        restoreIfPending({ allowPlay: true });
        tryStartPlayback();
        if (!pendingPlayRef.current) {
          setIsLoading(false);
        }
      }
    },
    onError: (e) => {
      const el = e?.currentTarget || resolveMainEl();
      const code = el?.error?.code;
      // Aborted / empty src during rapid track switch — not a stream failure.
      if (code === 1) return; // MEDIA_ERR_ABORTED
      if (!el?.src && !el?.currentSrc) return;
      const elSrc = el.currentSrc || el.src || '';
      if (currentAudioSrc && elSrc && !sameStreamResource(elSrc, currentAudioSrc)) return;
      const now = Date.now();
      if (now - streamErrorAtRef.current < 400) return;
      streamErrorAtRef.current = now;
      handleStreamError();
    },
  };

  const slotAIsMain = mainOnSlotA;
  const mainPreload = slotAIsMain ? 'auto' : (preloadAudioSrc ? 'auto' : 'none');

  const mainAudioProps = {
    'data-testid': 'player-audio-main',
    crossOrigin: 'anonymous',
    preload: 'auto',
    ...mainHandlers,
  };

  if (!PRELOAD_ENABLED) {
    return (
      <audio
        ref={attachSlotA}
        src={currentAudioSrc || undefined}
        {...mainAudioProps}
      />
    );
  }

  return (
    <>
      <audio
        ref={attachSlotA}
        src={slotAIsMain ? (currentAudioSrc || undefined) : (preloadAudioSrc || undefined)}
        preload={mainPreload}
        {...(slotAIsMain ? mainAudioProps : {})}
        style={slotAIsMain ? undefined : HIDDEN_AUDIO_STYLE}
      />
      <audio
        ref={attachSlotB}
        src={!slotAIsMain ? (currentAudioSrc || undefined) : (preloadAudioSrc || undefined)}
        preload={!slotAIsMain ? mainPreload : (preloadAudioSrc ? 'auto' : 'none')}
        {...(!slotAIsMain ? mainAudioProps : {})}
        style={!slotAIsMain ? undefined : HIDDEN_AUDIO_STYLE}
      />
    </>
  );
}
