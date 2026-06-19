import { describe, it, expect } from 'vitest';
import {
  resolveQueueIndex,
  clearTrackSwitchState,
  syncPlaylistRef,
  shouldTriggerTrackEnd,
  canStartCrossfade,
  isPreloadReadyForCrossfade,
  urlTargetsTrack,
  resumePausedPlayback,
  resumeMainPlaybackAfterHandoff,
  unlockPlaybackElement,
  resolveVolumeUpdate,
  formatTime,
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
