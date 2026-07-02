import { tracksMatch } from './trackNormalize';
import { isPausedMidPlayback, sameStreamResource } from './qualityPrefs';
import { CROSSFADE_SEC } from './playerConfig';
import { effectivePlaybackDuration } from './effectivePlaybackDuration';

/** Seconds before catalog end when we auto-advance (rAF + native ended guard). */
export const END_THRESHOLD_SEC = 0.35;

export function formatTime(secs) {
  if (!secs || Number.isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Resolve the active queue index even when React state and refs are briefly out of sync.
 */
export function resolveQueueIndex(playlist, currentIndex, currentTrack) {
  const pl = playlist || [];
  if (!pl.length) return -1;
  if (
    currentIndex >= 0
    && currentIndex < pl.length
    && tracksMatch(pl[currentIndex], currentTrack)
  ) {
    return currentIndex;
  }
  return pl.findIndex((tr) => tracksMatch(tr, currentTrack));
}

/** Drop seek/resume state from the previous track so the next one can start. */
export function clearTrackSwitchState({
  pendingSeekRef,
  pendingPlayAfterSeekRef,
  skipEndedRef,
}) {
  if (pendingSeekRef) pendingSeekRef.current = null;
  if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = false;
  if (skipEndedRef) skipEndedRef.current = false;
}

/** Keep playlist ref in sync with React state (refs update one tick later in useEffect). */
export function syncPlaylistRef(playlistRef, playlist) {
  if (playlistRef) playlistRef.current = playlist;
}

export function prepareAudioForNewTrack(audioEl, volume) {
  if (!audioEl) return;
  audioEl.volume = volume;
}

/** Supports numeric or functional updates (for hotkeys that step volume). */
export function resolveVolumeUpdate(previous, next) {
  const raw = typeof next === 'function' ? next(previous) : next;
  const v = Number(raw);
  if (!Number.isFinite(v)) return previous;
  return Math.max(0, Math.min(1, v));
}

/** Minimal silent WAV — unlock autoplay without leaving a pending play() on the main element. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA==';

/** Satisfy browser gesture policy using a throwaway element (never the stream `<audio>`). */
export function unlockPlaybackPolicy() {
  try {
    const probe = new Audio(SILENT_WAV);
    probe.volume = 0;
    const ret = probe.play();
    if (ret && typeof ret.then === 'function') {
      ret
        .then(() => {
          try {
            probe.pause();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/** Call synchronously from a click/tap handler so later play() after buffering is allowed. */
export function unlockPlaybackElement(audioEl, { useProbe = false } = {}) {
  // Never run the silent-WAV trick on the main element once Web Audio is wired —
  // clearing src without load() leaves it in a state where each play() outputs a blip.
  if (useProbe || !audioEl || audioEl._sourceNode) {
    unlockPlaybackPolicy();
    return;
  }
  const hasBuffered =
    Boolean(audioEl.src || audioEl.currentSrc)
    && audioEl.readyState >= 2; // HAVE_CURRENT_DATA
  if (hasBuffered) {
    unlockPlaybackPolicy();
    return;
  }
  try {
    const wasEmpty = !audioEl.src || audioEl.src.endsWith('undefined');
    if (wasEmpty) {
      audioEl.src = SILENT_WAV;
      // We don't call load() here to keep it fast, setting src is enough.
    }
    const ret = audioEl.play();
    const cleanup = () => {
      try {
        audioEl.pause();
        if (wasEmpty && audioEl.src === SILENT_WAV) {
          audioEl.removeAttribute('src');
          if (!audioEl._sourceNode) audioEl.load();
        }
      } catch {
        /* ignore */
      }
    };

    if (ret && typeof ret.then === 'function') {
      ret.then(cleanup).catch(cleanup);
    } else {
      cleanup();
    }
  } catch {
    /* ignore */
  }
}

/** True when a stream URL points at the given Tidal/provider track id. */
export function urlTargetsTrack(url, trackId) {
  if (!url || trackId == null || trackId === '') return false;
  const id = String(trackId);
  return url.includes(`/${id}?`) || url.includes(`/${id}&`);
}

/** Ignore stale/aborted stream errors during rapid track switches. */
export function shouldIgnoreStreamError({
  activeSrc = '',
  currentTrackId = null,
  currentAudioSrc = '',
  suppressUntilMs = 0,
  trackChangePending = false,
  now = performance.now(),
}) {
  if (trackChangePending) return true;
  if (suppressUntilMs > 0 && now < suppressUntilMs) return true;
  if (currentTrackId && activeSrc && !urlTargetsTrack(activeSrc, currentTrackId)) return true;
  if (activeSrc && currentAudioSrc && !sameStreamResource(activeSrc, currentAudioSrc)) return true;
  return false;
}

/**
 * Decide whether to call play() on the main element right now.
 *
 * Matches the wanted stream against EITHER the freshly-assigned `src` or the
 * live `currentSrc`: after a Web Audio clear (`src = ''` without load()) the
 * element keeps the previous track's `currentSrc` for a beat, so gating only on
 * `currentSrc` would skip the play() and leave a freshly selected track paused
 * until a second click.
 */
export function shouldStartPlayback({
  pendingPlay,
  pendingSeek = null,
  deferUntilReady = false,
  losslessReady = false,
  hasError = false,
  wantSrc = '',
  elSrc = '',
  elCurrentSrc = '',
}) {
  if (!pendingPlay) return false;
  if (pendingSeek != null) return false;
  if (deferUntilReady && !losslessReady) return false;
  if (hasError) return false;
  if (!wantSrc) return false;
  return sameStreamResource(elSrc, wantSrc) || sameStreamResource(elCurrentSrc, wantSrc);
}

/** Seconds of media buffered ahead of currentTime. */
export function bufferedSecondsAhead(audioEl) {
  if (!audioEl?.buffered?.length) return 0;
  const t = audioEl.currentTime || 0;
  let ahead = 0;
  for (let i = 0; i < audioEl.buffered.length; i += 1) {
    const start = audioEl.buffered.start(i);
    const end = audioEl.buffered.end(i);
    if (t >= start && t <= end) {
      ahead = Math.max(ahead, end - t);
    } else if (start > t) {
      ahead = Math.max(ahead, end - start);
    }
  }
  return ahead;
}

/** Enough buffered audio to resume or hand off without a one-blip stall. */
export function hasAdequatePlaybackBuffer(audioEl, trackDurationSec, { minAheadSec = 8 } = {}) {
  if (!audioEl) return false;
  const ahead = bufferedSecondsAhead(audioEl);
  const effective = effectivePlaybackDuration(trackDurationSec, audioEl.duration);
  if (!effective || effective <= 0) return ahead >= minAheadSec;
  const remaining = effective - (audioEl.currentTime || 0);
  if (remaining <= minAheadSec) return ahead > 0.25;
  return ahead >= Math.min(minAheadSec, remaining * 0.5);
}

/** Keep paused stream when it still belongs to the requested track. */
export function shouldPreservePausedStream(
  audioEl,
  trackId,
  trackDurationSec = 0,
  { activeStreamUrl = '' } = {},
) {
  if (!audioEl || trackId == null || trackId === '') return false;
  const src = audioEl.currentSrc || audioEl.src || '';
  if (!src || !isPausedMidPlayback(audioEl)) return false;
  const trackMatch = urlTargetsTrack(src, trackId)
    || (src.startsWith('blob:') && activeStreamUrl && sameStreamResource(src, activeStreamUrl));
  if (!trackMatch) return false;
  if (audioEl.ended || isAtTrackEnd(audioEl, trackDurationSec)) return false;
  return true;
}

/**
 * Resume a paused element without reloading src. Instant when already buffered.
 */
export function resumePausedPlayback(audioEl, {
  deferPlayUntilReady = false,
  pendingPlayRef,
  setIsPlaying,
  setIsLoading,
} = {}) {
  if (!audioEl) return;
  if (pendingPlayRef) pendingPlayRef.current = true;

  const buffered =
    Boolean(audioEl.src || audioEl.currentSrc)
    && audioEl.readyState >= 2; // HAVE_CURRENT_DATA

  if (buffered) {
    if (setIsLoading) setIsLoading(false);
    const ret = audioEl.play();
    const done = () => {
      if (pendingPlayRef) pendingPlayRef.current = false;
      if (setIsPlaying) setIsPlaying(true);
    };
    if (ret && typeof ret.then === 'function') {
      ret.then(done).catch(() => {
        if (pendingPlayRef) pendingPlayRef.current = true;
      });
    } else {
      done();
    }
    return;
  }

  if (deferPlayUntilReady && setIsLoading) setIsLoading(true);
  const ret = audioEl.play();
  if (ret && typeof ret.then === 'function') {
    ret
      .then(() => {
        if (!deferPlayUntilReady) {
          if (pendingPlayRef) pendingPlayRef.current = false;
          if (setIsPlaying) setIsPlaying(true);
          if (setIsLoading) setIsLoading(false);
        }
      })
      .catch(() => {
        if (pendingPlayRef) pendingPlayRef.current = true;
      });
  }
}

export function pauseAudioForTrackSwitch(audioEl) {
  if (!audioEl) return;
  try {
    audioEl.pause();
  } catch {
    /* ignore */
  }
}

/**
 * Pause for a new track. Web Audio–routed elements keep their src and
 * position: emptying them (`src = ''` with no load()) dismisses the OS media
 * notification mid-switch and leaves the element in a state where the next
 * play() emits a blip of stale audio, and seeking the dying stream to 0
 * fires a wasted network request. The next stream URL lands as a fresh src
 * attribute, which re-runs the load algorithm and resets position on its
 * own; pendingSeek(0) covers the rest.
 */
export function prepareMainAudioForTrackSwitch(audioEl) {
  if (!audioEl) return;
  pauseAudioForTrackSwitch(audioEl);
  if (!audioEl._sourceNode) {
    clearAudioElementSrc(audioEl);
  }
}

/** Clear an idle slot; keep src on Web Audio–routed elements to avoid blip state. */
export function clearIdleAudioSlot(audioEl) {
  if (!audioEl) return;
  pauseAudioForTrackSwitch(audioEl);
  if (audioEl._sourceNode) return;
  clearAudioElementSrc(audioEl);
}

/**
 * After slot swap / crossfade handoff the main element may be buffered but paused
 * (React re-attaches handlers and canplay may have already fired).
 */
export function resumeMainPlaybackAfterHandoff(audioEl, {
  pendingPlayRef,
  setIsPlaying,
  setIsLoading,
  volume = 1,
  onEngineInit,
} = {}) {
  if (!audioEl) return;
  audioEl.volume = volume;
  onEngineInit?.();

  const markPlaying = () => {
    if (pendingPlayRef) pendingPlayRef.current = false;
    setIsPlaying?.(true);
    setIsLoading?.(false);
  };
  const markPending = () => {
    if (pendingPlayRef) pendingPlayRef.current = true;
    setIsLoading?.(true);
  };

  if (!audioEl.paused) {
    markPlaying();
    return;
  }

  markPending();
  try {
    const ret = audioEl.play();
    if (ret && typeof ret.then === 'function') {
      ret.then(markPlaying).catch(markPending);
    } else {
      markPlaying();
    }
  } catch {
    markPending();
  }
}

export function clearAudioElementSrc(audioEl) {
  if (!audioEl) return;
  try {
    audioEl.pause();
  } catch {
    /* ignore */
  }
  try {
    if (audioEl._sourceNode) {
      // load() after createMediaElementSource breaks seek forever — assign empty src instead.
      audioEl.src = '';
    } else {
      audioEl.removeAttribute('src');
      audioEl.load();
    }
  } catch {
    /* ignore */
  }
}

export function shouldTriggerTrackEnd({
  isPlaying,
  currentTime,
  effectiveDuration,
  seeking,
  seekCooldownActive,
  endedGuard,
  crossfading,
  thresholdSec = END_THRESHOLD_SEC,
}) {
  return (
    isPlaying
    && effectiveDuration > 0
    && !seeking
    && !seekCooldownActive
    && !endedGuard
    && !crossfading
    && currentTime >= effectiveDuration - thresholdSec
  );
}

/** Natural end — `ended` event or catalog time (streams often pause without firing `ended`). */
export function isAtTrackEnd(audioEl, trackDurationSec, thresholdSec = END_THRESHOLD_SEC) {
  if (!audioEl) return false;
  if (audioEl.ended) return true;
  const effective = effectivePlaybackDuration(trackDurationSec, audioEl.duration);
  if (!effective || effective <= 0) return false;
  return (audioEl.currentTime || 0) >= effective - thresholdSec;
}

/** Shared guard for onEnded / onPause-at-end before calling playNext. */
export function shouldAdvanceToNextTrack({ crossfading, skipEndedRef }) {
  if (crossfading) return false;
  if (skipEndedRef?.current) {
    skipEndedRef.current = false;
    return false;
  }
  return true;
}

export function isPreloadReadyForCrossfade(audioEl) {
  if (!audioEl) return false;
  // HAVE_CURRENT_DATA === 2 (HTMLMediaElement not available in node tests)
  return audioEl.readyState >= 2;
}

export function canStartCrossfade({
  isPlaying,
  seeking,
  seekCooldownActive,
  crossfading,
  hasNext,
  preloadReady,
  trackKey,
  crossfadeStartedFor,
  remaining,
  crossfadeSec = CROSSFADE_SEC,
}) {
  return (
    isPlaying
    && !seeking
    && !seekCooldownActive
    && !crossfading
    && hasNext
    && preloadReady
    && !!trackKey
    && crossfadeStartedFor !== trackKey
    && remaining > 0.05
    && remaining <= crossfadeSec
  );
}
