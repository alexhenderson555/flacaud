import { useRef } from 'react';
import { formatTime } from '../utils/playerTransportLogic';
import { usePlayerQueue } from './usePlayerQueue';
import { usePlayerRadio } from './usePlayerRadio';
import { usePlayerProgressLoop } from './usePlayerProgressLoop';

/**
 * Player transport facade: queue + radio + progress/crossfade/seek.
 */
export function usePlayerTransport(props) {
  const queueOriginRef = useRef(null);
  const startTrackRadioRef = useRef(null);
  const endedGuardRef = useRef(false);
  const seekCooldownUntilRef = useRef(0);
  const seekScrubbingRef = useRef(false);

  const queue = usePlayerQueue({
    ...props,
    queueOriginRef,
    startTrackRadioRef,
  });

  const radio = usePlayerRadio({
    lang: props.lang,
    t: props.t,
    playQueue: queue.playQueue,
    startTrackRadioRef,
    suppressQualityToastsRef: props.suppressQualityToastsRef,
  });

  const progress = usePlayerProgressLoop({
    ...props,
    playNext: queue.playNext,
    advanceToNextTrack: queue.advanceToNextTrack,
    resolveQueueIndex: queue.resolveQueueIndex,
    endedGuardRef,
    seekCooldownUntilRef,
    seekScrubbingRef,
  });

  return {
    togglePlay: queue.togglePlay,
    playQueue: queue.playQueue,
    playShuffledQueue: queue.playShuffledQueue,
    handleReorderQueue: queue.handleReorderQueue,
    playNext: queue.playNext,
    playPrevious: queue.playPrevious,
    startTrackRadio: radio.startTrackRadio,
    radioLoadingTrackId: radio.radioLoadingTrackId,
    nextTrack: queue.nextTrack,
    handleSeekPreview: progress.handleSeekPreview,
    handleSeekCommit: progress.handleSeekCommit,
    beginSeekScrub: progress.beginSeekScrub,
    formatTime,
  };
}
