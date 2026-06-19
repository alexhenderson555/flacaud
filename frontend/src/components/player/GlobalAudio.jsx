import { useCallback, useEffect, useRef } from 'react';
import { initAudioEngine, resumeAudioContext } from '../../utils/audioEngine';
import { PRELOAD_ENABLED } from '../../utils/playerConfig';

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
    if (!pendingPlayRef.current || !audioRef.current) return;
    if (pendingSeekRef.current != null) return;
    if (deferPlayUntilReady && !losslessReadyRef.current) return;
    skipEndedRef.current = false;
    const el = audioRef.current;
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
    audioRef,
    pendingPlayRef,
    pendingSeekRef,
    skipEndedRef,
    setIsPlaying,
    setIsLoading,
    deferPlayUntilReady,
    volume,
  ]);

  // Retry when stream URL lands — canplay may have fired before handlers attached (slot swap).
  useEffect(() => {
    if (!currentAudioSrc || !pendingPlayRef.current) return undefined;
    const el = audioRef.current;
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
  }, [currentAudioSrc, audioRef, pendingPlayRef, tryStartPlayback]);

  // Cached stream / rapid track switch: src unchanged but user still wants play.
  useEffect(() => {
    if (!pendingPlayRef.current) return undefined;
    if (crossfadingRef?.current) return undefined;
    const el = audioRef.current;
    if (!el || !el.paused) return undefined;
    if (pendingSeekRef.current != null) return undefined;
    if (!currentAudioSrc) return undefined;
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined;

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
    audioRef,
    pendingPlayRef,
    pendingSeekRef,
    crossfadingRef,
    tryStartPlayback,
  ]);

  // UI/audio desync: intended play but element still paused after track switch.
  useEffect(() => {
    if (crossfadingRef?.current) return undefined;
    const el = audioRef.current;
    if (!el || !el.paused) return undefined;
    if (pendingSeekRef.current != null) return undefined;
    if (!currentAudioSrc) return undefined;
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined;
    if (!pendingPlayRef.current && !isPlaying) return undefined;

    pendingPlayRef.current = true;
    if (!isLoading) setIsLoading(true);
    const kick = () => tryStartPlayback();
    const raf = requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
    };
  }, [
    isPlaying,
    isLoading,
    currentAudioSrc,
    currentTrackId,
    audioRef,
    pendingPlayRef,
    pendingSeekRef,
    crossfadingRef,
    tryStartPlayback,
    setIsLoading,
  ]);

  const restoreIfPending = useCallback((opts = {}) => {
    if (pendingSeekRef.current != null) restorePendingSeek(opts);
  }, [pendingSeekRef, restorePendingSeek]);

  const onMediaReady = useCallback(() => {
    if (holdUntilLosslessReady()) return;
    const el = audioRef.current;
    const waitingToPlay = pendingPlayRef.current;
    if (waitingToPlay && el && el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setIsLoading(true);
      return;
    }
    restoreIfPending({ allowPlay: true });
    if (fadeInPendingRef.current) {
      runFadeIn();
    } else if (audioRef.current) {
      audioRef.current.volume = volume;
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
    audioRef,
    volume,
    tryStartPlayback,
  ]);

  const onFullBufferReady = useCallback(() => {
    losslessReadyRef.current = true;
    restoreIfPending({ allowPlay: true });
    if (fadeInPendingRef.current) {
      runFadeIn();
    } else if (audioRef.current) {
      audioRef.current.volume = volume;
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
    audioRef,
    volume,
    tryStartPlayback,
  ]);

  const mainHandlers = {
    onPlay: () => {
      if (holdUntilLosslessReady()) return;
      initAudioEngine(audioRef);
      setIsPlaying(true);
      const el = audioRef.current;
      if (!el || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        setIsLoading(true);
      }
    },
    onPause: () => {
      if (pendingPlayRef.current) return;
      setIsPlaying(false);
      if (audioRef.current) setProgress(audioRef.current.currentTime || 0);
    },
    onSeeking: () => {
      skipEndedRef.current = true;
    },
    onSeeked: () => {
      skipEndedRef.current = false;
      if (audioRef.current) setProgress(audioRef.current.currentTime || 0);
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
      if (audioRef.current?.seeking) return;
      setIsLoading(true);
    },
    onStalled: () => {
      if (audioRef.current?.seeking) return;
      setIsLoading(true);
    },
    onProgress: () => {
      const el = audioRef.current;
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
      if (audioRef.current) audioRef.current.volume = volume;
      if (holdUntilLosslessReady()) return;
      setIsLoading(false);
      setIsPlaying(true);
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
    onError: () => handleStreamError(),
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
