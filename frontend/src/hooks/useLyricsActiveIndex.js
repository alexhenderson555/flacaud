import { useEffect, useRef, useState } from 'react';
import { getActiveLyricIndex, LYRICS_SYNC_LEAD_S } from '../utils/lyrics';
import { getPlaybackCurrentTime } from '../utils/playbackTime';

// On track change the A/B audio swap can briefly report the *previous* track's
// (near-end) time before the new element resets to ~0. Feeding that stale, large
// time into getActiveLyricIndex snaps karaoke straight to the last line. After
// new lyrics arrive we hold on the first line until the clock either rewinds to
// the start (fresh play) or stays put long enough to be a real resume-at-position.
const FRESH_START_MAX_S = 3;
const STALE_GUARD_MAX_FRAMES = 45; // ~0.75s at 60fps before we trust the clock anyway

/** rAF-driven active lyric line using the real playback clock. */
export function useLyricsActiveIndex(lyrics, { getMainAudioEl, audioRef, progress } = {}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeIdxRef = useRef(-1);
  const waitForResetRef = useRef(false);
  const waitFramesRef = useRef(0);

  useEffect(() => {
    if (lyrics.length > 0) {
      activeIdxRef.current = 0;
      setActiveIdx(0);
      waitForResetRef.current = true; // new track: ignore a stale carried-over clock
      waitFramesRef.current = 0;
    } else {
      activeIdxRef.current = -1;
      setActiveIdx(-1);
      waitForResetRef.current = false;
    }
  }, [lyrics]);

  useEffect(() => {
    if (!lyrics?.length) return undefined;

    let rafId;
    const update = () => {
      const t = getPlaybackCurrentTime({ getMainAudioEl, audioRef, progress });
      if (waitForResetRef.current) {
        if (t <= FRESH_START_MAX_S || waitFramesRef.current >= STALE_GUARD_MAX_FRAMES) {
          waitForResetRef.current = false; // clock is now the new track's (or a real resume)
        } else {
          waitFramesRef.current += 1;
          rafId = requestAnimationFrame(update);
          return; // keep showing the first line instead of snapping to the last
        }
      }
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
