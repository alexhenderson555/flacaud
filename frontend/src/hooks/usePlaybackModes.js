import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  cycleRepeatMode,
  loadRepeatMode,
  loadShuffleEnabled,
  persistRepeat,
  persistShuffle,
  REPEAT_OFF,
} from '../utils/playbackModes';

export function usePlaybackModes() {
  const [shuffleEnabled, setShuffleEnabled] = useState(() => loadShuffleEnabled());
  const [repeatMode, setRepeatMode] = useState(() => loadRepeatMode());
  const modesRef = useRef({ shuffle: shuffleEnabled, repeat: repeatMode });

  useLayoutEffect(() => {
    modesRef.current = { shuffle: shuffleEnabled, repeat: repeatMode };
  }, [shuffleEnabled, repeatMode]);

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((prev) => {
      const next = !prev;
      persistShuffle(next);
      return next;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next = cycleRepeatMode(prev);
      persistRepeat(next);
      return next;
    });
  }, []);

  const setShuffle = useCallback((enabled) => {
    setShuffleEnabled(enabled);
    persistShuffle(enabled);
  }, []);

  const setRepeat = useCallback((mode) => {
    setRepeatMode(mode);
    persistRepeat(mode);
  }, []);

  return {
    shuffleEnabled,
    repeatMode,
    modesRef,
    toggleShuffle,
    cycleRepeat,
    setShuffle,
    setRepeat,
    defaultRepeat: REPEAT_OFF,
  };
}
