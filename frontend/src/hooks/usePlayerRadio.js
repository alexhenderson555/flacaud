import { useCallback, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { apiGetJson, apiPostJson, messageForApiError } from '../utils/apiClient';
import { buildRadioQueue } from '../utils/trackNormalize';

/** Track / artist / AI radio queue bootstrap. */
export function usePlayerRadio({
  lang,
  t,
  playQueue,
  startTrackRadioRef,
}) {
  const startTrackRadio = useCallback(async (track) => {
    const pid = String(track.provider_id);
    const provider = track.provider || 'tidal';
    const seedQueue = buildRadioQueue(track, []);
    if (seedQueue.length > 0) {
      playQueue(seedQueue[0], seedQueue);
    }

    const applyRadioQueue = (radioTracks, toastKey = 'trackRadioStarted') => {
      const queue = buildRadioQueue(track, radioTracks);
      if (queue.length <= 1) return false;
      playQueue(queue[0], queue);
      showToast(t(toastKey));
      return true;
    };

    try {
      try {
        const radioData = await apiGetJson(
          `/api/track/${provider}/${pid}/radio?limit=30&fast=1`,
          { auth: true, lang },
        );
        if (radioData.tracks?.length > 0 && applyRadioQueue(radioData.tracks)) {
          return;
        }
      } catch {
        /* try full radio, then ai fallback */
      }

      try {
        const radioData = await apiGetJson(
          `/api/track/${provider}/${pid}/radio?limit=30`,
          { auth: true, lang },
        );
        if (radioData.tracks?.length > 0 && applyRadioQueue(radioData.tracks)) {
          return;
        }
      } catch {
        /* try ai fallback */
      }

      const vibeQuery = lang === 'ru'
        ? `Сыграй треки, похожие на ${track.title} от ${track.artists?.[0] || 'Unknown'}`
        : `Play tracks similar to ${track.title} by ${track.artists?.[0] || 'Unknown'}`;

      try {
        const data = await apiPostJson('/api/ai-playlist', { query: vibeQuery, limit: 15 }, { lang });
        if (data.tracks?.length > 0 && applyRadioQueue(data.tracks)) {
          return;
        }
      } catch {
        /* artist fallback */
      }

      const artistId = track.artist_ids?.[0];
      if (artistId) {
        try {
          const artistData = await apiGetJson(`/api/artist/${artistId}`, { lang });
          const top = artistData.top_tracks || [];
          if (applyRadioQueue(top, 'artistRadioStarted')) {
            return;
          }
        } catch {
          /* ignore */
        }
      }
      showToast(t('radioFailed'));
    } catch (err) {
      showToast(messageForApiError(err, lang));
    }
  }, [lang, playQueue, t]);

  useEffect(() => {
    if (startTrackRadioRef) startTrackRadioRef.current = startTrackRadio;
  }, [startTrackRadio, startTrackRadioRef]);

  return { startTrackRadio };
}
