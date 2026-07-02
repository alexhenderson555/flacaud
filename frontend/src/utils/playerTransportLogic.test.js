import { describe, it, expect } from 'vitest';
import {
  resolveQueueIndex,
  clearTrackSwitchState,
  syncPlaylistRef,
  shouldTriggerTrackEnd,
  canStartCrossfade,
  isPreloadReadyForCrossfade,
  urlTargetsTrack,
  shouldPreservePausedStream,
  resumePausedPlayback,
  resumeMainPlaybackAfterHandoff,
  prepareMainAudioForTrackSwitch,
  unlockPlaybackElement,
  resolveVolumeUpdate,
  formatTime,
  isAtTrackEnd,
  shouldAdvanceToNextTrack,
  hasAdequatePlaybackBuffer,
  shouldIgnoreStreamError,
  shouldStartPlayback,
  END_THRESHOLD_SEC,
} from './playerTransportLogic';

const TRACK_A = { provider_id: '1', title: 'A' };
const TRACK_B = { provider_id: '2', title: 'B' };

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('resolveQueueIndex', () => {
  it('returns index when it matches current track', () => {
    expect(resolveQueueIndex([TRACK_A, TRACK_B], 1, TRACK_B)).toBe(1);
  });

  it('re-resolves when stored index is stale', () => {
    expect(resolveQueueIndex([TRACK_A, TRACK_B], 0, TRACK_B)).toBe(1);
  });

  it('returns -1 for empty playlist', () => {
    expect(resolveQueueIndex([], 0, TRACK_A)).toBe(-1);
  });
});

describe('unlockPlaybackElement', () => {
  it('does not pause a buffered element (avoids resume race)', async () => {
    let paused = false;
    const el = {
      src: 'blob:test',
      currentSrc: 'blob:test',
      readyState: 2,
      play: () => Promise.resolve(),
      pause: () => { paused = true; },
    };
    unlockPlaybackElement(el);
    await Promise.resolve();
    expect(paused).toBe(false);
  });
});

describe('resumePausedPlayback', () => {
  it('calls play immediately when audio is already buffered', async () => {
    const pendingPlayRef = { current: false };
    let loading = true;
    let playing = false;
    const el = {
      src: 'blob:test',
      currentSrc: 'blob:test',
      readyState: 3,
      play: () => {
        el.paused = false;
        return Promise.resolve();
      },
      paused: true,
    };
    resumePausedPlayback(el, {
      deferPlayUntilReady: true,
      pendingPlayRef,
      setIsPlaying: (v) => { playing = v; },
      setIsLoading: (v) => { loading = v; },
    });
    await Promise.resolve();
    expect(loading).toBe(false);
    expect(playing).toBe(true);
    expect(pendingPlayRef.current).toBe(false);
  });
});

describe('prepareMainAudioForTrackSwitch', () => {
  it('pauses a Web Audio element but keeps its media alive', () => {
    // Keeping src/position preserves the OS media notification through the
    // switch and avoids the blip-on-play state of an emptied wired element.
    const el = {
      _sourceNode: {},
      src: 'blob:track-a',
      currentTime: 42,
      pause: () => { el.paused = true; },
      paused: false,
    };
    prepareMainAudioForTrackSwitch(el);
    expect(el.src).toBe('blob:track-a');
    expect(el.currentTime).toBe(42);
    expect(el.paused).toBe(true);
  });

  it('clears src on plain audio elements', () => {
    let loaded = false;
    const el = {
      removeAttribute: () => { el.src = ''; },
      load: () => { loaded = true; },
      pause: () => {},
      src: 'blob:track-a',
    };
    prepareMainAudioForTrackSwitch(el);
    expect(loaded).toBe(true);
  });
});

describe('clearTrackSwitchState', () => {
  it('clears seek and ended guards', () => {
    const pendingSeekRef = { current: 42 };
    const pendingPlayAfterSeekRef = { current: true };
    const skipEndedRef = { current: true };
    clearTrackSwitchState({ pendingSeekRef, pendingPlayAfterSeekRef, skipEndedRef });
    expect(pendingSeekRef.current).toBeNull();
    expect(pendingPlayAfterSeekRef.current).toBe(false);
    expect(skipEndedRef.current).toBe(false);
  });
});

describe('syncPlaylistRef', () => {
  it('writes playlist into ref immediately', () => {
    const playlistRef = { current: [] };
    syncPlaylistRef(playlistRef, [TRACK_A, TRACK_B]);
    expect(playlistRef.current).toEqual([TRACK_A, TRACK_B]);
  });
});

describe('shouldTriggerTrackEnd', () => {
  it('fires near catalog end when guards are clear', () => {
    expect(shouldTriggerTrackEnd({
      isPlaying: true,
      currentTime: 199.8,
      effectiveDuration: 200,
      seeking: false,
      seekCooldownActive: false,
      endedGuard: false,
      crossfading: false,
      thresholdSec: END_THRESHOLD_SEC,
    })).toBe(true);
  });

  it('does not fire while seeking or crossfading', () => {
    expect(shouldTriggerTrackEnd({
      isPlaying: true,
      currentTime: 199.9,
      effectiveDuration: 200,
      seeking: true,
      seekCooldownActive: false,
      endedGuard: false,
      crossfading: false,
    })).toBe(false);

    expect(shouldTriggerTrackEnd({
      isPlaying: true,
      currentTime: 199.9,
      effectiveDuration: 200,
      seeking: false,
      seekCooldownActive: false,
      endedGuard: false,
      crossfading: true,
    })).toBe(false);
  });

  it('does not fire when paused', () => {
    expect(shouldTriggerTrackEnd({
      isPlaying: false,
      currentTime: 199.9,
      effectiveDuration: 200,
      seeking: false,
      seekCooldownActive: false,
      endedGuard: false,
      crossfading: false,
    })).toBe(false);
  });
});

describe('canStartCrossfade', () => {
  it('allows crossfade in the final window with preload ready', () => {
    expect(canStartCrossfade({
      isPlaying: true,
      seeking: false,
      seekCooldownActive: false,
      crossfading: false,
      hasNext: true,
      preloadReady: true,
      trackKey: '1',
      crossfadeStartedFor: null,
      remaining: 5,
      crossfadeSec: 6,
    })).toBe(true);
  });

  it('blocks when already crossfading or preload missing', () => {
    expect(canStartCrossfade({
      isPlaying: true,
      seeking: false,
      seekCooldownActive: false,
      crossfading: true,
      hasNext: true,
      preloadReady: true,
      trackKey: '1',
      crossfadeStartedFor: null,
      remaining: 4,
    })).toBe(false);

    expect(canStartCrossfade({
      isPlaying: true,
      seeking: false,
      seekCooldownActive: false,
      crossfading: false,
      hasNext: true,
      preloadReady: false,
      trackKey: '1',
      crossfadeStartedFor: null,
      remaining: 4,
    })).toBe(false);
  });

  it('blocks repeat crossfade for the same track key', () => {
    expect(canStartCrossfade({
      isPlaying: true,
      seeking: false,
      seekCooldownActive: false,
      crossfading: false,
      hasNext: true,
      preloadReady: true,
      trackKey: '1',
      crossfadeStartedFor: '1',
      remaining: 3,
    })).toBe(false);
  });
});

describe('isPreloadReadyForCrossfade', () => {
  it('accepts HAVE_CURRENT_DATA (readyState >= 2)', () => {
    expect(isPreloadReadyForCrossfade({ readyState: 2 })).toBe(true);
    expect(isPreloadReadyForCrossfade({ readyState: 1 })).toBe(false);
  });
});

describe('urlTargetsTrack', () => {
  it('matches track id in stream path', () => {
    expect(urlTargetsTrack('/api/stream/tidal/123?quality=LOSSLESS', '123')).toBe(true);
    expect(urlTargetsTrack('/api/stream/tidal/123?quality=LOSSLESS', '12')).toBe(false);
  });
});

describe('shouldIgnoreStreamError', () => {
  it('ignores errors from another track or during switch', () => {
    expect(shouldIgnoreStreamError({
      activeSrc: '/api/stream/tidal/111?quality=HIGH',
      currentTrackId: '222',
      currentAudioSrc: '/api/stream/tidal/222?quality=HIGH',
    })).toBe(true);
    expect(shouldIgnoreStreamError({
      activeSrc: '/api/stream/tidal/111?quality=HIGH',
      currentTrackId: '111',
      currentAudioSrc: '/api/stream/tidal/111?quality=HIGH',
      trackChangePending: true,
    })).toBe(true);
    expect(shouldIgnoreStreamError({
      activeSrc: '/api/stream/tidal/111?quality=HIGH',
      currentTrackId: '111',
      currentAudioSrc: '/api/stream/tidal/111?quality=HIGH',
      suppressUntilMs: performance.now() + 5000,
    })).toBe(true);
    expect(shouldIgnoreStreamError({
      activeSrc: '/api/stream/tidal/111?quality=LOSSLESS',
      currentTrackId: '111',
      currentAudioSrc: '/api/stream/tidal/111?quality=LOSSLESS',
    })).toBe(false);
  });
});

describe('shouldPreservePausedStream', () => {
  it('preserves when paused stream matches track id', () => {
    const el = {
      paused: true,
      currentTime: 42,
      ended: false,
      duration: 200,
      currentSrc: '/api/stream/tidal/111?quality=HIGH',
      src: '/api/stream/tidal/111?quality=HIGH',
      buffered: {
        length: 1,
        start: () => 0,
        end: () => 120,
      },
    };
    expect(shouldPreservePausedStream(el, '111', 200)).toBe(true);
    expect(shouldPreservePausedStream(el, '222', 200)).toBe(false);
    expect(shouldPreservePausedStream({ ...el, paused: false }, '111', 200)).toBe(false);
  });

  it('does not preserve at catalog end', () => {
    const atEnd = {
      paused: true,
      currentTime: 199.8,
      ended: false,
      duration: 200,
      currentSrc: '/api/stream/tidal/111?quality=HIGH',
      src: '/api/stream/tidal/111?quality=HIGH',
      buffered: { length: 1, start: () => 0, end: () => 200 },
    };
    expect(shouldPreservePausedStream(atEnd, '111', 200)).toBe(false);

    const thin = {
      paused: true,
      currentTime: 2,
      ended: false,
      duration: 200,
      currentSrc: '/api/stream/tidal/111?quality=HIGH',
      src: '/api/stream/tidal/111?quality=HIGH',
      buffered: { length: 1, start: () => 0, end: () => 3 },
    };
    expect(shouldPreservePausedStream(thin, '111', 200)).toBe(true);
  });

  it('preserves blob cache URLs when active stream matches', () => {
    const blob = 'blob:http://localhost/abc-123';
    const el = {
      paused: true,
      currentTime: 42,
      ended: false,
      duration: 200,
      currentSrc: blob,
      src: blob,
    };
    expect(shouldPreservePausedStream(el, '111', 200, { activeStreamUrl: blob })).toBe(true);
    expect(shouldPreservePausedStream(el, '111', 200, { activeStreamUrl: 'blob:http://localhost/other' })).toBe(false);
  });
});

describe('hasAdequatePlaybackBuffer', () => {
  it('requires meaningful lookahead mid-track', () => {
    const el = {
      currentTime: 10,
      duration: 200,
      buffered: { length: 1, start: () => 0, end: () => 12 },
    };
    expect(hasAdequatePlaybackBuffer(el, 200)).toBe(false);
    el.buffered = { length: 1, start: () => 0, end: () => 30 };
    expect(hasAdequatePlaybackBuffer(el, 200)).toBe(true);
  });
});

describe('isAtTrackEnd', () => {
  it('detects ended element', () => {
    expect(isAtTrackEnd({ ended: true, currentTime: 0, duration: 200 }, 200)).toBe(true);
  });

  it('detects near catalog end when stream pauses without ended', () => {
    const el = { ended: false, currentTime: 199.8, duration: 30 };
    expect(isAtTrackEnd(el, 200)).toBe(true);
  });

  it('is false mid-track', () => {
    expect(isAtTrackEnd({ ended: false, currentTime: 60, duration: 200 }, 200)).toBe(false);
  });
});

describe('shouldAdvanceToNextTrack', () => {
  it('blocks when crossfading or skipEnded is set', () => {
    const skipEndedRef = { current: true };
    expect(shouldAdvanceToNextTrack({ crossfading: true, skipEndedRef })).toBe(false);
    expect(shouldAdvanceToNextTrack({ crossfading: false, skipEndedRef })).toBe(false);
    expect(skipEndedRef.current).toBe(false);
    expect(shouldAdvanceToNextTrack({ crossfading: false, skipEndedRef: { current: false } })).toBe(true);
  });
});

describe('resumeMainPlaybackAfterHandoff', () => {
  it('calls play when the handoff element is paused', async () => {
    const pendingPlayRef = { current: false };
    let playing = false;
    let loading = false;
    const el = {
      paused: true,
      volume: 0,
      play: () => {
        el.paused = false;
        return Promise.resolve();
      },
    };
    resumeMainPlaybackAfterHandoff(el, {
      pendingPlayRef,
      setIsPlaying: (v) => { playing = v; },
      setIsLoading: (v) => { loading = v; },
      volume: 0.8,
    });
    await Promise.resolve();
    expect(el.paused).toBe(false);
    expect(playing).toBe(true);
    expect(loading).toBe(false);
    expect(pendingPlayRef.current).toBe(false);
  });

  it('skips play when already audible', () => {
    const pendingPlayRef = { current: true };
    let playCalls = 0;
    const el = {
      paused: false,
      volume: 0,
      play: () => {
        playCalls += 1;
        return Promise.resolve();
      },
    };
    resumeMainPlaybackAfterHandoff(el, {
      pendingPlayRef,
      setIsPlaying: () => {},
      setIsLoading: () => {},
    });
    expect(playCalls).toBe(0);
    expect(pendingPlayRef.current).toBe(false);
  });
});

describe('resolveVolumeUpdate', () => {
  it('steps volume with functional updates', () => {
    expect(resolveVolumeUpdate(0.5, (v) => v + 0.05)).toBe(0.55);
    expect(resolveVolumeUpdate(0.02, (v) => v - 0.05)).toBe(0);
    expect(resolveVolumeUpdate(0.98, (v) => v + 0.05)).toBe(1);
  });

  it('accepts direct numeric values', () => {
    expect(resolveVolumeUpdate(0.5, 0.8)).toBe(0.8);
  });
});

describe('shouldStartPlayback', () => {
  const WANT = '/api/stream/tidal/2?quality=LOSSLESS&bypass_registry=true&mt=aaa&_rn=0';
  // Same resource, differing only by short-lived cache-buster params (mt, _rn).
  const SAME_ABS = 'http://localhost/api/stream/tidal/2?quality=LOSSLESS&bypass_registry=true&mt=zzz&_rn=3';
  const OLD_TRACK = 'http://localhost/api/stream/tidal/1?quality=LOSSLESS&mt=bbb&_rn=0';

  const base = {
    pendingPlay: true,
    pendingSeek: null,
    deferUntilReady: false,
    losslessReady: false,
    hasError: false,
    wantSrc: WANT,
    elSrc: WANT,
    elCurrentSrc: WANT,
  };

  it('starts when the assigned src matches even if currentSrc is still the previous track', () => {
    // The regression: after a Web Audio clear, currentSrc lags on the old URL.
    expect(shouldStartPlayback({ ...base, elSrc: WANT, elCurrentSrc: OLD_TRACK })).toBe(true);
  });

  it('starts when only currentSrc matches (src already advanced)', () => {
    expect(shouldStartPlayback({ ...base, elSrc: '', elCurrentSrc: SAME_ABS })).toBe(true);
  });

  it('ignores mt/_rn cache-busters when matching the stream resource', () => {
    expect(shouldStartPlayback({ ...base, elSrc: SAME_ABS, elCurrentSrc: SAME_ABS })).toBe(true);
  });

  it('does not start when neither src points at the wanted stream', () => {
    expect(shouldStartPlayback({ ...base, elSrc: OLD_TRACK, elCurrentSrc: OLD_TRACK })).toBe(false);
  });

  it('does not start a different quality of the same track', () => {
    const other = WANT.replace('quality=LOSSLESS', 'quality=HIGH');
    expect(shouldStartPlayback({ ...base, elSrc: other, elCurrentSrc: other })).toBe(false);
  });

  it('requires play intent', () => {
    expect(shouldStartPlayback({ ...base, pendingPlay: false })).toBe(false);
  });

  it('waits while a seek is pending', () => {
    expect(shouldStartPlayback({ ...base, pendingSeek: 42 })).toBe(false);
  });

  it('holds lossless until the full buffer is ready', () => {
    expect(shouldStartPlayback({ ...base, deferUntilReady: true, losslessReady: false })).toBe(false);
    expect(shouldStartPlayback({ ...base, deferUntilReady: true, losslessReady: true })).toBe(true);
  });

  it('does not start on a media error or with no wanted src', () => {
    expect(shouldStartPlayback({ ...base, hasError: true })).toBe(false);
    expect(shouldStartPlayback({ ...base, wantSrc: '' })).toBe(false);
  });
});
