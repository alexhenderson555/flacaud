import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedAudioUrl } from '../utils/cache';
import { resolveMediaTokenForStream } from '../utils/mediaToken';
import { DJ_ANALYSIS_CONCURRENCY, DJ_PREFS_CHANGED_EVENT } from '../utils/djPrefs';
import {
  isDjAnalysisBlockedForTrack,
  shouldDeferBackgroundMedia,
  subscribePlaybackPriority,
} from '../utils/playbackPriority';
import { dispatchLibraryPatch } from '../utils/libraryPatch';
import {
  analyzeTrackFeatures,
  clearFailedFeatureCacheForTracks,
  getLibraryTrackFeatures,
  loadPersistedFeatures,
  syncDjMetaToServer,
} from '../utils/trackFeatures';

async function streamUrlForTrack(track) {
  if (shouldDeferBackgroundMedia() || isDjAnalysisBlockedForTrack(track?.provider_id)) {
    return null;
  }
  const cached = await getCachedAudioUrl(track, 'HIGH');
  if (cached) return cached;
  const mt = await resolveMediaTokenForStream();
  if (!mt) return null;
  const base = `/api/stream/${track.provider || 'tidal'}/${track.provider_id}?quality=HIGH&bypass_registry=true&mt=${mt}`;
  return window.__TAURI__ ? `http://localhost:8000${base}` : base;
}

async function analyzeOneTrack(track) {
  let result = await analyzeTrackFeatures(track, null);
  if (result?.analyzed !== false) return result;
  const url = await streamUrlForTrack(track);
  result = await analyzeTrackFeatures(track, url);
  return result;
}

/**
 * @param {Array} tracks
 * @param {{ enabled?: boolean, analyze?: boolean, maxAnalyze?: number }} options
 */
export function useTrackFeaturesForList(tracks, options = {}) {
  const { enabled = true, analyze = true, maxAnalyze = 80 } = options;
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadPersistedFeatures();
    bump();
  }, [bump]);

  useEffect(() => {
    const onDjPrefs = () => {
      clearFailedFeatureCacheForTracks(tracksRef.current);
      bump();
    };
    window.addEventListener(DJ_PREFS_CHANGED_EVENT, onDjPrefs);
    return () => window.removeEventListener(DJ_PREFS_CHANGED_EVENT, onDjPrefs);
  }, [bump]);

  useEffect(() => subscribePlaybackPriority(bump), [bump]);

  const pendingKey = useMemo(() => {
    void tick;
    return (tracks || [])
      .filter((t) => t?.provider_id && !getLibraryTrackFeatures(t))
      .map((t) => String(t.provider_id))
      .slice(0, maxAnalyze)
      .join(',');
  }, [tracks, tick, maxAnalyze]);

  useEffect(() => {
    if (!enabled || !analyze || !pendingKey) return undefined;

    const pendingIds = pendingKey.split(',').filter(Boolean);
    let cursor = 0;
    const CONCURRENCY = DJ_ANALYSIS_CONCURRENCY;

    const resolveTrack = (providerId) => (
      tracksRef.current?.find((t) => String(t.provider_id) === providerId) || null
    );

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const runWorker = async () => {
      while (mountedRef.current) {
        if (shouldDeferBackgroundMedia()) {
          await sleep(800);
          continue;
        }

        const index = cursor;
        cursor += 1;
        if (index >= pendingIds.length) break;

        const track = resolveTrack(pendingIds[index]);
        if (!track || getLibraryTrackFeatures(track)) continue;
        if (isDjAnalysisBlockedForTrack(track.provider_id)) continue;

        try {
          const result = await analyzeOneTrack(track);
          if (!mountedRef.current || !result || result.analyzed === false) continue;

          if (track.id) await syncDjMetaToServer(track.id, result);
          dispatchLibraryPatch({
            op: 'dj-meta',
            provider_id: track.provider_id,
            bpm: result.bpm,
            camelot_key: result.camelotKey,
            musical_key: result.musicalKey,
          });
          bump();
        } catch {
          /* retry on interval bump */
        }
      }
    };

    Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));
    return undefined;
  }, [pendingKey, enabled, analyze, bump]);

  useEffect(() => {
    if (!enabled || !analyze) return undefined;
    const timer = setInterval(() => {
      const anyPending = (tracksRef.current || []).some(
        (t) => t?.provider_id && !getLibraryTrackFeatures(t),
      );
      if (anyPending) bump();
    }, 15000);
    return () => clearInterval(timer);
  }, [enabled, analyze, bump]);

  const getFeatures = useCallback(
    (track) => {
      void tick;
      return getLibraryTrackFeatures(track);
    },
    [tick],
  );

  const pendingCount = (tracks || []).filter((t) => !getLibraryTrackFeatures(t)).length;

  return { getFeatures, pendingCount };
}

/** @deprecated use useTrackFeaturesForList */
export const useLibraryTrackFeatures = (library, options = {}) =>
  useTrackFeaturesForList(library, { maxAnalyze: 80, ...options });
