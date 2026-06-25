import { useCallback, useEffect } from 'react';
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
  shouldAdvanceToNextTrack,
} from '../utils/playerTransportLogic';
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
      if (main) setProgress(main.currentTime || 0);
    }
  }, [isPlaying, audioRef, getMainAudioEl, setProgress]);

  useEffect(() => {
    let animationFrameId;
    let crossfadeRafId;
    let lastProgressSync = 0;

    const updateProgress = () => {
      if (document.visibilityState === 'hidden') return;
      const main = getMainAudioEl?.() ?? audioRef.current;
      if (main && trackDuration > 0) {
        const ct = main.currentTime;
        const now = performance.now();
        if (now - lastProgressSync >= 250) {
          lastProgressSync = now;
          if (!seekScrubbingRef.current) {
            setProgress(ct);
          }
        }

        const effectiveDuration = effectivePlaybackDuration(
          trackDuration,
          main.duration,
        );

        const seeking = main.seeking;
        const seekCooldown = performance.now() < seekCooldownUntilRef.current;
        const atNaturalEnd = isAtTrackEnd(main, trackDuration);

        if (shouldTriggerTrackEnd({
          isPlaying: isPlaying || atNaturalEnd,
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
          isPlaying,
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
      const keepProgressLoop = isPlaying || (
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
      const keepProgressLoop = isPlaying || (
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
  ]);

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

    if (pendingSeekRef) pendingSeekRef.current = null;
    if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = false;

    if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
      setProgress(newTime);
      return;
    }

    try {
      el.currentTime = newTime;
    } catch {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
    }
    const applied = Math.abs((el.currentTime || 0) - newTime) < 0.75;
    if (!applied) {
      if (pendingSeekRef) pendingSeekRef.current = newTime;
      if (isPlaying) pendingPlayAfterSeekRef.current = true;
    }
    setProgress(applied ? (el.currentTime || newTime) : newTime);
    if (isPlaying) {
      el.play().catch(() => {
        if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = true;
      });
    }
  }, [
    trackDuration, audioRef, getMainAudioEl, setProgress, resetEndDetection, skipEndedRef,
    pendingSeekRef, pendingPlayAfterSeekRef, isPlaying, seekScrubbingRef,
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
