import { useCallback, useEffect, useRef } from 'react';
import { initAudioEngine, resumeAudioContext, setGraphGain } from '../../utils/audioEngine';
import { PRELOAD_ENABLED } from '../../utils/playerConfig';
import { sameStreamResource } from '../../utils/qualityPrefs';
import {
  bufferedSecondsAhead,
  shouldAdvanceToNextTrack,
  shouldIgnoreStreamError,
  shouldStartPlayback,
} from '../../utils/playerTransportLogic';
import { effectivePlaybackDuration } from '../../utils/effectivePlaybackDuration';

// Build up a playback buffer before starting a fresh track, so it doesn't begin
// after ~1s and immediately re-buffer (worst on Lossless). Best-effort: play
// anyway once this budget elapses so a slow/progressive stream still starts.
const INITIAL_PREBUFFER_SEC = 10;
const INITIAL_PREBUFFER_TIMEOUT_MS = 8000;

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
  trackDuration,
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
  endedGuardRef,
  crossfadingRef,
  volume,
  handleStreamError,
  deferPlayUntilReady = false,
}) {
  const losslessReadyRef = useRef(false);
  const losslessStreamPathRef = useRef('');
  const streamErrorAtRef = useRef(0);
  const prebufferStartRef = useRef(0);

  // Reset the prebuffer budget when the stream (track/quality) changes.
  useEffect(() => { prebufferStartRef.current = 0; }, [currentAudioSrc]);

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
    if (!el || el.dataset.staleSrc === 'true') return;
    if (!shouldStartPlayback({
      pendingPlay: pendingPlayRef.current,
      pendingSeek: pendingSeekRef.current,
      deferUntilReady: deferPlayUntilReady,
      losslessReady: losslessReadyRef.current,
      hasError: Boolean(el.error),
      wantSrc: currentAudioSrc,
      elSrc: el.src || '',
      elCurrentSrc: el.currentSrc || '',
    })) return;
    // Pre-buffer gate: wait until ~10s is buffered before the first play, so the
    // track doesn't start after ~1s and immediately re-buffer. Skipped near the
    // end of a track, and bypassed after a best-effort timeout so slow/progressive
    // streams still start. A seek uses its own wait (playAfterSeekBuffered), so
    // only gate when there's no pending seek. The watchdog keeps calling this until
    // the buffer fills or the budget elapses.
    if (pendingSeekRef.current == null) {
      const dur = effectivePlaybackDuration(trackDuration, el.duration);
      const remaining = dur && dur > 0 ? dur - (el.currentTime || 0) : Infinity;
      const nearEnd = remaining <= INITIAL_PREBUFFER_SEC + 1;
      if (!nearEnd && bufferedSecondsAhead(el) < INITIAL_PREBUFFER_SEC) {
        if (!prebufferStartRef.current) prebufferStartRef.current = performance.now();
        if (performance.now() - prebufferStartRef.current < INITIAL_PREBUFFER_TIMEOUT_MS) {
          setIsLoading(true);
          return;
        }
      }
    }
    prebufferStartRef.current = 0;
    skipEndedRef.current = false;
    el.volume = volume;
    // currentSrc is now confirmed to be the new track (shouldStartPlayback gates on it)
    // and staleSrc is cleared — safe to lift the switch mute.
    setGraphGain(el, 1);
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
    trackDuration,
  ]);

  // Single playback watchdog. Once there is intent to play (the queue armed
  // pendingPlayRef, or the UI shows playing) and a stream URL is committed,
  // keep nudging the element until it actually starts — or until intent is
  // withdrawn or a stream error / seek takes over. This replaces several
  // one-shot timer "kicks" that gave up after ~300ms: if the element was not
  // ready in that window and no further media event or dep change arrived, a
  // freshly selected track stayed paused until the user clicked it a second
  // time (which fell through to the resume path).
  useEffect(() => {
    if (!currentAudioSrc) return undefined;
    if (crossfadingRef?.current) return undefined;
    if (!pendingPlayRef.current && !isPlaying) return undefined;

    let stopped = false;
    let timerId = null;
    // Long enough to cover the initial pre-buffer wait (~8s) plus margin before
    // treating a truly stalled load as a 503.
    const deadline = Date.now() + 14000;

    const stop = () => {
      stopped = true;
      if (timerId) clearTimeout(timerId);
    };

    const schedule = () => {
      if (stopped) return;
      if (Date.now() >= deadline) {
        // Window elapsed and the element never started. A 503/stall that never
        // fired an `error` event would otherwise leave the spinner up forever —
        // route it into stream-error recovery so it retries / falls back quality /
        // ultimately surfaces a toast and stops loading.
        const el = resolveMainEl();
        // Only a genuine stall (no meaningful buffer) is a 503 — a track that is
        // simply still pre-buffering has data and must not trigger recovery.
        const stalledUnstarted = el && el.paused && !el.error
          && (el.currentTime || 0) < 0.5
          && bufferedSecondsAhead(el) < 1
          && (pendingPlayRef.current || isPlaying)
          && pendingSeekRef.current == null;
        if (stalledUnstarted) {
          streamErrorAtRef.current = Date.now();
          handleStreamError?.();
        }
        stop();
        return;
      }
      // Plain timer, NOT requestAnimationFrame: rAF is frozen in a hidden/
      // background tab, so an auto-advanced next track would never start until
      // the tab is refocused. Timers still fire (throttled to ~1s) while hidden,
      // so playback begins promptly even in the background.
      timerId = setTimeout(tick, 160);
    };

    function tick() {
      if (stopped) return;
      const el = resolveMainEl();
      // Done: playing, finished, or hard error (error path drives recovery).
      if (el && (!el.paused || el.ended || el.error)) {
        stop();
        return;
      }
      // Intent withdrawn (user paused, or stream error gave up).
      if (!pendingPlayRef.current && !isPlaying) {
        stop();
        return;
      }
      // Let stream-error recovery or an active seek settle first; keep watching.
      if (Date.now() - streamErrorAtRef.current < 1200 || pendingSeekRef.current != null) {
        schedule();
        return;
      }
      // Recover intent when the UI shows "playing" but the element is paused
      // (a rapid src swap aborted the play() and it was never re-armed).
      if (isPlaying && !pendingPlayRef.current) pendingPlayRef.current = true;
      tryStartPlayback();
      schedule();
    }

    timerId = setTimeout(tick, 0);
    return stop;
  }, [
    currentAudioSrc,
    currentTrackId,
    isPlaying,
    resolveMainEl,
    pendingPlayRef,
    pendingSeekRef,
    crossfadingRef,
    tryStartPlayback,
    handleStreamError,
  ]);

  // Sync element src when React stream URL updated (Web Audio slot keeps stale blob until React commits).
  useEffect(() => {
    if (!currentAudioSrc) return undefined;
    const el = resolveMainEl();
    if (!el) return undefined;
    // Check the src attribute and currentSrc separately: right after React
    // commits the new src attribute, currentSrc still reports the previous
    // track (resource selection is async) — re-assigning here would abort
    // and restart the load React already kicked off.
    if (sameStreamResource(el.src || '', currentAudioSrc)
      || sameStreamResource(el.currentSrc || '', currentAudioSrc)) {
      delete el.dataset.staleSrc;
      return undefined;
    }
    try {
      if (!el.paused) {
        el.pause();
      }
      delete el.dataset.staleSrc;
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
    if (!el) return;
    const isReadyForNewTrack = sameStreamResource(el.currentSrc || '', currentAudioSrc);
    if (!isReadyForNewTrack && el.currentSrc) return;

    const waitingToPlay = pendingPlayRef.current;
    if (waitingToPlay && el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
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
      const el = resolveMainEl();
      // Ignore a spurious 'ended' that fires before the track actually played
      // (e.g. an empty/errored src on a fresh load) — advancing on it made the
      // first click jump ahead. Require the element to have reached (near) its end.
      if (el) {
        const ct = el.currentTime || 0;
        const dur = effectivePlaybackDuration(trackDuration, el.duration);
        const reachedEnd = dur > 0 ? ct >= dur - 2.5 : ct > 1;
        if (!reachedEnd) return;
      }
      if (!shouldAdvanceToNextTrack({ crossfading: crossfadingRef?.current, skipEndedRef, endedGuardRef })) return;
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
      if (!el) return;
      const isReadyForNewTrack = sameStreamResource(el.currentSrc || '', currentAudioSrc);
      if (!isReadyForNewTrack && el.currentSrc) return;

      el.volume = volume;
      if (holdUntilLosslessReady()) return;
      setIsLoading(false);
      setIsPlaying(true);
    },
    onTimeUpdate: () => {
      const el = resolveMainEl();
      if (!el || el.paused) return;
      const isReadyForNewTrack = sameStreamResource(el.currentSrc || '', currentAudioSrc);
      if (!isReadyForNewTrack && el.currentSrc) return;

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
      if (shouldIgnoreStreamError({
        activeSrc: elSrc,
        currentTrackId,
        currentAudioSrc,
      })) {
        return;
      }
      const now = Date.now();
      if (now - streamErrorAtRef.current < 800) return;
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
