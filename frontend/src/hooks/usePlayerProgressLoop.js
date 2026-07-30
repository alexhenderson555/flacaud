import { useCallback, useEffect, useRef } from 'react';
import { effectivePlaybackDuration } from '../utils/effectivePlaybackDuration';
import { markSeekActivity } from '../utils/playbackPriority';
import { PRELOAD_ENABLED, CROSSFADE_ENABLED } from '../utils/playerConfig';
import { hasQueueSuccessor } from '../utils/playbackModes';
import {
  shouldTriggerTrackEnd,
  canStartCrossfade,
  isPreloadReadyForCrossfade,
  clearIdleAudioSlot,
  resumeMainPlaybackAfterHandoff,
  isAtTrackEnd,
  bufferedSecondsAhead,
} from '../utils/playerTransportLogic';

/** After a seek, wait until this many seconds are buffered ahead before resuming. */
const SEEK_PREBUFFER_SEC = 10;
/** Never hold longer than this waiting for the buffer (slow-network fallback). */
const SEEK_PREBUFFER_TIMEOUT_MS = 8000;
import { initAudioEngine as setupAudioEngine } from '../utils/audioEngine';

/** rAF progress sync, auto-advance, crossfade, and seek scrubbing. */
export function usePlayerProgressLoop({
  audioRef,
  preloadAudioRef,
  volume,
  trackDuration,
  isPlaying,
  setIsPlaying,
  setIsLoading,
  setProgress,
  currentTrack,
  preloadAudioSrc,
  playlistRef,
  currentTrackRef,
  pendingPlayRef,
  crossfadingRef,
  crossfadeStartedForRef,
  fadeInPendingRef,
  skipEndedRef,
  skipAudioSrcSyncRef,
  pendingSeekRef,
  pendingSeekTrackKeyRef,
  pendingPlayAfterSeekRef,
  modesRef,
  shuffleEnabled = false,
  repeatMode = 'off',
  setCurrentAudioSrc,
  setPreloadAudioSrc,
  swapAudioSlots,
  getMainAudioEl,
  getPreloadAudioEl,
  playNext,
  advanceToNextTrack,
  resolveQueueIndex,
  endedGuardRef,
  seekCooldownUntilRef,
  seekScrubbingRef,
  lastElapsedRef,
}) {
  const initAudioEngine = useCallback(() => {
    const el = getMainAudioEl?.() ?? audioRef.current;
    setupAudioEngine({ current: el });
  }, [audioRef, getMainAudioEl]);

  const resetEndDetection = useCallback(() => {
    endedGuardRef.current = false;
    crossfadeStartedForRef.current = null;
    crossfadingRef.current = false;
    seekCooldownUntilRef.current = performance.now() + 1500;
  }, [crossfadingRef, crossfadeStartedForRef, endedGuardRef, seekCooldownUntilRef]);

  useEffect(() => {
    crossfadingRef.current = false;
    crossfadeStartedForRef.current = null;
    endedGuardRef.current = false;
    seekCooldownUntilRef.current = 0;
  }, [currentTrack?.provider_id, crossfadingRef, crossfadeStartedForRef, endedGuardRef, seekCooldownUntilRef]);

  useEffect(() => {
    if (!isPlaying) {
      const main = getMainAudioEl?.() ?? audioRef.current;
      if (main) {
        setProgress(main.currentTime || 0);
        if (lastElapsedRef) lastElapsedRef.current = main.currentTime || 0;
      }
    }
  }, [isPlaying, audioRef, getMainAudioEl, setProgress, lastElapsedRef]);

  useEffect(() => {
    let animationFrameId;
    let crossfadeRafId;
    let lastProgressSync = 0;

    const updateProgress = () => {
      if (document.visibilityState === 'hidden') return;
      const main = getMainAudioEl?.() ?? audioRef.current;
      if (main && trackDuration > 0) {
        const ct = main.currentTime;
        if (lastElapsedRef) lastElapsedRef.current = ct;
        const audioActive = !main.paused && !main.ended;
        const now = performance.now();
        if (now - lastProgressSync >= 250) {
          lastProgressSync = now;
          if (!seekScrubbingRef.current) {
            setProgress(ct);
          }
        }

        if (audioActive && !isPlaying && !seekScrubbingRef.current) {
          setIsPlaying(true);
        }

        const effectiveDuration = effectivePlaybackDuration(
          trackDuration,
          main.duration,
        );

        const seeking = main.seeking;
        const seekCooldown = performance.now() < seekCooldownUntilRef.current;
        const atNaturalEnd = isAtTrackEnd(main, trackDuration);

        if (shouldTriggerTrackEnd({
          isPlaying: isPlaying || audioActive || atNaturalEnd,
          currentTime: ct,
          effectiveDuration,
          seeking,
          seekCooldownActive: seekCooldown,
          endedGuard: endedGuardRef.current,
          crossfading: crossfadingRef.current,
        })) {
          endedGuardRef.current = true;
          skipEndedRef.current = true;
          playNext();
          return;
        }

        const remaining = effectiveDuration - ct;
        const pl = playlistRef.current || [];
        const qIdx = resolveQueueIndex();
        const modes = modesRef?.current || { shuffle: shuffleEnabled, repeat: repeatMode };
        const hasNext = hasQueueSuccessor(pl, qIdx, modes);
        const trackKey = currentTrackRef.current ? String(currentTrackRef.current.provider_id) : null;
        const preloadReady = isPreloadReadyForCrossfade(preloadAudioRef?.current);

        if (PRELOAD_ENABLED && CROSSFADE_ENABLED && canStartCrossfade({
          isPlaying: isPlaying || audioActive,
          seeking,
          seekCooldownActive: seekCooldown,
          crossfading: crossfadingRef.current,
          hasNext,
          preloadReady,
          trackKey,
          crossfadeStartedFor: crossfadeStartedForRef.current,
          remaining,
        })) {
          const mainEl = audioRef.current;
          const pre = preloadAudioRef?.current;
          crossfadeStartedForRef.current = trackKey;

          if (!mainEl || !pre) {
            return;
          }

          crossfadingRef.current = true;
          if (skipEndedRef) skipEndedRef.current = true;
          const fadeMs = Math.max(400, remaining * 1000);
          let preStarted = false;

          const finishHandoff = () => {
            crossfadingRef.current = false;
            fadeInPendingRef.current = false;
            const handoffUrl = pre.currentSrc || preloadAudioSrc || '';

            pendingPlayRef.current = true;
            setIsLoading(true);
            setIsPlaying(true);
            mainEl.pause();
            mainEl.volume = 0;
            advanceToNextTrack();
            if (handoffUrl && skipAudioSrcSyncRef) {
              skipAudioSrcSyncRef.current = handoffUrl;
            }
            setCurrentAudioSrc?.(handoffUrl);
            setPreloadAudioSrc?.('');
            swapAudioSlots?.();

            const playing = getMainAudioEl?.() ?? audioRef.current;
            const idle = getPreloadAudioEl?.() ?? preloadAudioRef.current;
            clearIdleAudioSlot(idle);
            if (playing) {
              // Do not seek to handoffTime — the element is already mid-playback from crossfade.
              resumeMainPlaybackAfterHandoff(playing, {
                pendingPlayRef,
                setIsPlaying,
                setIsLoading,
                volume,
                onEngineInit: initAudioEngine,
              });
            } else {
              setIsPlaying(false);
              setIsLoading(false);
            }
            if (pendingSeekRef) pendingSeekRef.current = null;
            if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = false;
            if (skipEndedRef) skipEndedRef.current = false;
          };

          const startCrossfade = () => {
            pre.volume = 0;
            pre.currentTime = 0;
            pre.play()
              .then(() => {
                preStarted = true;
                setIsPlaying(true);
                const fadeStart = performance.now();
                crossfadeRafId = requestAnimationFrame((t) => runCrossfade(t, fadeStart));
              })
              .catch(() => {
                crossfadingRef.current = false;
                // Do not clear crossfadeStartedForRef to prevent an infinite loop of retries
                if (!preStarted) endedGuardRef.current = false;
              });
          };

          const runCrossfade = (now, fadeStart) => {
            const fadeT = Math.min(1, (now - fadeStart) / fadeMs);
            mainEl.volume = volume * (1 - fadeT);
            pre.volume = volume * fadeT;
            if (fadeT >= 1) {
              finishHandoff();
            } else {
              crossfadeRafId = requestAnimationFrame((t) => runCrossfade(t, fadeStart));
            }
          };

          startCrossfade();
        }
      }
      const audioActive = main && !main.paused && !main.ended;
      const keepProgressLoop = isPlaying || audioActive || (
        main
        && trackDuration > 0
        && isAtTrackEnd(main, trackDuration)
        && !endedGuardRef.current
        && !crossfadingRef.current
      );
      if (keepProgressLoop && document.visibilityState !== 'hidden') {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    const kick = () => {
      const main = getMainAudioEl?.() ?? audioRef.current;
      const audioActive = main && !main.paused && !main.ended;
      const keepProgressLoop = isPlaying || audioActive || (
        main
        && trackDuration > 0
        && isAtTrackEnd(main, trackDuration)
        && !endedGuardRef.current
        && !crossfadingRef?.current
      );
      if (keepProgressLoop && document.visibilityState !== 'hidden') {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };
    kick();
    document.addEventListener('visibilitychange', kick);
    return () => {
      document.removeEventListener('visibilitychange', kick);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (crossfadeRafId) cancelAnimationFrame(crossfadeRafId);
    };
  }, [
    isPlaying, trackDuration, volume, preloadAudioSrc, playNext, advanceToNextTrack, resolveQueueIndex,
    setProgress, audioRef, getMainAudioEl, preloadAudioRef, playlistRef, currentTrackRef,
    crossfadingRef, crossfadeStartedForRef, fadeInPendingRef, skipEndedRef, skipAudioSrcSyncRef,
    pendingPlayRef, pendingSeekRef, pendingPlayAfterSeekRef, setIsPlaying, setIsLoading,
    modesRef, shuffleEnabled, repeatMode, setCurrentAudioSrc, setPreloadAudioSrc, swapAudioSlots,
    getPreloadAudioEl, initAudioEngine, endedGuardRef, seekCooldownUntilRef, seekScrubbingRef,
    lastElapsedRef,
  ]);

  const seekBufferWaitRef = useRef(null);

  const clearSeekBufferWait = useCallback(() => {
    if (seekBufferWaitRef.current) {
      clearInterval(seekBufferWaitRef.current);
      seekBufferWaitRef.current = null;
    }
  }, []);

  // Resume after a seek only once enough audio is buffered ahead, so a lossless
  // stream doesn't play ~1s then stall to re-buffer. Plays instantly when already
  // buffered (cached blobs / near track end) and falls back to playing after a
  // timeout on slow networks. Cancelled by a new seek, track change or pause.
  const playAfterSeekBuffered = useCallback((el) => {
    clearSeekBufferWait();
    const dur = effectivePlaybackDuration(trackDuration, el.duration);
    const enough = () => {
      const remaining = dur && dur > 0 ? dur - (el.currentTime || 0) : Infinity;
      return bufferedSecondsAhead(el) >= SEEK_PREBUFFER_SEC || remaining <= SEEK_PREBUFFER_SEC + 1;
    };
    const go = () => {
      clearSeekBufferWait();
      el.play().then(() => {
        setIsLoading(false);
      }).catch(() => {
        // Don't clear the spinner on a failed attempt -- GlobalAudio's own
        // retry effect (watching pendingPlayRef, ~160ms ticks over a 14s
        // window) is what actually retries play() here; it was previously
        // never armed because only pendingPlayAfterSeekRef got set, which
        // nothing reads for this path. Clearing isLoading unconditionally
        // (before this fix, even before the play() attempt) is exactly what
        // made the spinner disappear while playback was still silently
        // retrying, reading as "stuck" and prompting a manual pause+resume.
        if (pendingPlayRef) pendingPlayRef.current = true;
        if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = true;
        setIsLoading(true);
      });
    };
    if (enough()) { go(); return; }
    setIsLoading(true);
    const startedAt = performance.now();
    seekBufferWaitRef.current = setInterval(() => {
      if (el.error) { clearSeekBufferWait(); setIsLoading(false); return; }
      const cur = getMainAudioEl?.() ?? audioRef.current;
      if (cur !== el) {
        // A legitimate abandonment (newer seek, track change, or pause)
        // already clears this interval via its own path before this can
        // fire -- reaching here with a different current element means the
        // audio-element identity changed underneath the wait for some other
        // reason (e.g. an internal slot swap), not that this wait is stale.
        // Silently giving up here previously stranded playback paused until
        // the user manually paused/resumed; retarget onto whatever's
        // current instead.
        clearSeekBufferWait();
        if (cur && !cur.error) playAfterSeekBuffered(cur);
        else setIsLoading(false);
        return;
      }
      if (enough() || performance.now() - startedAt >= SEEK_PREBUFFER_TIMEOUT_MS) go();
    }, 200);
  }, [trackDuration, setIsLoading, getMainAudioEl, audioRef, pendingPlayRef, pendingPlayAfterSeekRef, clearSeekBufferWait]);

  // Cancel a pending post-seek buffer wait when playback is paused or the track changes.
  useEffect(() => {
    if (!isPlaying) clearSeekBufferWait();
  }, [isPlaying, clearSeekBufferWait]);
  useEffect(() => {
    clearSeekBufferWait();
    return clearSeekBufferWait;
  }, [currentTrack?.provider_id, clearSeekBufferWait]);

  const handleSeekPreview = useCallback((time) => {
    if (!Number.isFinite(time)) return;
    const el = getMainAudioEl?.() ?? audioRef.current;
    if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const dur = effectivePlaybackDuration(trackDuration, el?.duration);
    if (!dur || !Number.isFinite(dur) || dur <= 0) return;
    setProgress(Math.max(0, Math.min(time, Math.max(0, dur - 0.25))));
  }, [trackDuration, audioRef, getMainAudioEl, setProgress]);

  const handleSeekCommit = useCallback((time) => {
    markSeekActivity();
    clearSeekBufferWait();
    seekScrubbingRef.current = false;
    skipEndedRef.current = false;

    const el = getMainAudioEl?.() ?? audioRef.current;
    if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const dur = effectivePlaybackDuration(trackDuration, el.duration);
    if (!dur || !Number.isFinite(dur) || dur <= 0) return;
    if (!Number.isFinite(time)) return;
    const newTime = Math.max(0, Math.min(time, Math.max(0, dur - 0.25)));

    resetEndDetection();
    skipEndedRef.current = true;

    const trackKey = currentTrackRef.current
      ? `${currentTrackRef.current.provider || 'tidal'}:${currentTrackRef.current.provider_id}`
      : '';

    if (pendingSeekRef) pendingSeekRef.current = null;
    if (pendingSeekTrackKeyRef) pendingSeekTrackKeyRef.current = '';
    if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = false;

    if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (pendingSeekTrackKeyRef) pendingSeekTrackKeyRef.current = trackKey;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
      setProgress(newTime);
      return;
    }

    try {
      el.currentTime = newTime;
    } catch {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (pendingSeekTrackKeyRef) pendingSeekTrackKeyRef.current = trackKey;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
    }
    const applied = Math.abs((el.currentTime || 0) - newTime) < 0.75;
    if (!applied) {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (pendingSeekTrackKeyRef) pendingSeekTrackKeyRef.current = trackKey;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
    }
    setProgress(applied ? (el.currentTime || newTime) : newTime);
    if (isPlaying) {
      playAfterSeekBuffered(el);
    }
  }, [
    trackDuration, audioRef, getMainAudioEl, setProgress, resetEndDetection, skipEndedRef,
    pendingSeekRef, pendingSeekTrackKeyRef, pendingPlayAfterSeekRef, isPlaying, seekScrubbingRef,
    clearSeekBufferWait, playAfterSeekBuffered, currentTrackRef,
  ]);

  const beginSeekScrub = useCallback(() => {
    const el = getMainAudioEl?.() ?? audioRef.current;
    if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    markSeekActivity();
    seekScrubbingRef.current = true;
    skipEndedRef.current = true;
  }, [skipEndedRef, audioRef, getMainAudioEl, seekScrubbingRef]);

  return {
    handleSeekPreview,
    handleSeekCommit,
    beginSeekScrub,
    resetEndDetection,
  };
}
