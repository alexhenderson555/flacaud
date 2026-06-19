import { useEffect, useRef, useState } from 'react';
import { getActiveLyricIndex, LYRICS_SYNC_LEAD_S } from '../utils/lyrics';
import { getPlaybackCurrentTime } from '../utils/playbackTime';

/** rAF-driven active lyric line using the real playback clock. */
export function useLyricsActiveIndex(lyrics, { getMainAudioEl, audioRef, progress } = {}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeIdxRef = useRef(-1);

  useEffect(() => {
    if (lyrics.length > 0) {
      activeIdxRef.current = 0;
      setActiveIdx(0);
    } else {
      activeIdxRef.current = -1;
      setActiveIdx(-1);
    }
  }, [lyrics]);

  useEffect(() => {
    if (!lyrics?.length) return undefined;

    let rafId;
    const update = () => {
      const t = getPlaybackCurrentTime({ getMainAudioEl, audioRef, progress });
      const newIdx = getActiveLyricIndex(lyrics, t, LYRICS_SYNC_LEAD_S);
      if (newIdx !== activeIdxRef.current) {
        activeIdxRef.current = newIdx;
        setActiveIdx(newIdx);
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [lyrics, getMainAudioEl, audioRef, progress]);

  return activeIdx;
}
