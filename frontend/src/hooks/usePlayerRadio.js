import { useCallback, useEffect, useState } from 'react';
import { showToast } from '../utils/toast';
import { apiGetJson, apiPostJson, messageForApiError } from '../utils/apiClient';
import { buildRadioQueue, pickRadioStartTrack } from '../utils/trackNormalize';

/** Track / artist / AI radio queue bootstrap. */
export function usePlayerRadio({
  lang,
  t,
  playQueue,
  startTrackRadioRef,
  suppressQualityToastsRef,
}) {
  const [radioLoadingTrackId, setRadioLoadingTrackId] = useState(null);

  const startTrackRadio = useCallback(async (track, { advancePastSeed = false } = {}) => {
    const pid = String(track?.provider_id || '');
    if (!pid) return false;
    setRadioLoadingTrackId(pid);
    if (suppressQualityToastsRef) suppressQualityToastsRef.current = true;

    const provider = track.provider || 'tidal';

    if (!advancePastSeed) {
      const seedQueue = buildRadioQueue(track, []);
      if (seedQueue.length > 0) {
        playQueue(seedQueue[0], seedQueue);
      }
    }

    const applyRadioQueue = (radioTracks, toastKey = 'trackRadioStarted') => {
      const queue = buildRadioQueue(track, radioTracks);
      const start = pickRadioStartTrack(queue, { advancePastSeed });
      if (!start || queue.length <= 1) return false;
      playQueue(start, queue);
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
          return true;
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
          return true;
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
          return true;
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
            return true;
          }
        } catch {
          /* ignore */
        }
      }
      showToast(t('radioFailed'));
      return false;
    } catch (err) {
      showToast(messageForApiError(err, lang));
      return false;
    } finally {
      setRadioLoadingTrackId((cur) => (cur === pid ? null : cur));
      if (suppressQualityToastsRef) {
        window.setTimeout(() => {
          suppressQualityToastsRef.current = false;
        }, 6000);
      }
    }
  }, [lang, playQueue, t, suppressQualityToastsRef]);

  const startArtistRadio = useCallback(async (artist) => {
    const aid = String(artist?.id || '');
    if (!aid) return false;
    setRadioLoadingTrackId(`artist_${aid}`);
    if (suppressQualityToastsRef) suppressQualityToastsRef.current = true;
    try {
      let topTracks = [];
      try {
        const artistData = await apiGetJson(`/api/artist/${aid}`, { lang });
        topTracks = artistData.top_tracks || [];
      } catch {
        // ignore
      }

      const vibeQuery = lang === 'ru'
        ? `Сыграй треки, похожие на ${artist.name}`
        : `Play tracks similar to ${artist.name}`;

      let aiTracks = [];
      try {
        const data = await apiPostJson('/api/ai-playlist', { query: vibeQuery, limit: 15 }, { lang });
        aiTracks = data.tracks || [];
      } catch {
        // ignore
      }

      const combined = [...topTracks, ...aiTracks];
      if (combined.length === 0) {
        showToast(t('radioFailed'));
        return false;
      }
      const queue = buildRadioQueue(combined[0], combined);
      if (queue.length > 0) {
        playQueue(queue[0], queue);
        showToast(t('artistRadioStarted'));
        return true;
      }
      return false;
    } catch (err) {
      showToast(messageForApiError(err, lang));
      return false;
    } finally {
      setRadioLoadingTrackId(null);
      if (suppressQualityToastsRef) {
        window.setTimeout(() => {
          suppressQualityToastsRef.current = false;
        }, 6000);
      }
    }
  }, [lang, playQueue, t, suppressQualityToastsRef]);

  useEffect(() => {
    if (startTrackRadioRef) startTrackRadioRef.current = startTrackRadio;
  }, [startTrackRadio, startTrackRadioRef]);

  return { startTrackRadio, startArtistRadio, radioLoadingTrackId };
}
