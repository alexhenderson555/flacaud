import { useCallback, useRef, useState } from 'react';

/** Two physical <audio> nodes; swap which is main vs preload without losing buffer. */
export function useAudioSlotPair() {
  const slotARef = useRef(null);
  const slotBRef = useRef(null);
  const audioRef = useRef(null);
  const preloadAudioRef = useRef(null);
  const mainOnSlotARef = useRef(true);
  const [mainOnSlotA, setMainOnSlotA] = useState(true);

  const syncPairRefs = useCallback((onSlotA) => {
    audioRef.current = onSlotA ? slotARef.current : slotBRef.current;
    preloadAudioRef.current = onSlotA ? slotBRef.current : slotARef.current;
  }, []);

  const getMainAudioEl = useCallback(
    () => (mainOnSlotARef.current ? slotARef.current : slotBRef.current),
    [],
  );

  const getPreloadAudioEl = useCallback(
    () => (mainOnSlotARef.current ? slotBRef.current : slotARef.current),
    [],
  );

  const attachSlotA = useCallback((el) => {
    slotARef.current = el;
    syncPairRefs(mainOnSlotARef.current);
  }, [syncPairRefs]);

  const attachSlotB = useCallback((el) => {
    slotBRef.current = el;
    syncPairRefs(mainOnSlotARef.current);
  }, [syncPairRefs]);

  const swapAudioSlots = useCallback(() => {
    mainOnSlotARef.current = !mainOnSlotARef.current;
    syncPairRefs(mainOnSlotARef.current);
    setMainOnSlotA(mainOnSlotARef.current);
  }, [syncPairRefs]);

  return {
    attachSlotA,
    attachSlotB,
    mainOnSlotA,
    swapAudioSlots,
    getMainAudioEl,
    getPreloadAudioEl,
    audioRef,
    preloadAudioRef,
  };
};
