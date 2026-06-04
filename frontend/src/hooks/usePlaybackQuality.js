import { useState, useRef, useEffect, useCallback } from 'react';
import { getCachedAudioUrl } from '../utils/cache';
import { getMediaToken } from '../utils/mediaToken';
import {
  ALL_UI_QUALITIES,
  lowerQualityTier,
  setStoredPlaybackQuality,
  getStoredPlaybackQuality,
  pickQualityForPlan,
  isQualityAllowedForPlan,
  clampQualityToPlan,
} from '../utils/qualityPrefs';
import { readQualityProbeCache, writeQualityProbeCache } from '../utils/qualityProbeCache';

/**
 * Per-track quality probe, stream URL, and safe fallback when HI_RES is unavailable.
 */
export function usePlaybackQuality({
  enabled = true,
  currentTrack,
  downloadedTracksRef,
  downloadRegistryTick = 0,
  effectivePlan = 'free',
  lang,
  showToast,
  audioRef,
  isPlaying,
  setIsLoading,
  setIsPlaying,
  setProgress,
}) {
  const [playbackQuality, setPlaybackQualityState] = useState(() =>
    clampQualityToPlan(getStoredPlaybackQuality(), effectivePlan),
  );
  const [currentAudioSrc, setCurrentAudioSrc] = useState('');
  const [preloadAudioSrc, setPreloadAudioSrc] = useState('');
  const [actualQuality, setActualQuality] = useState('');
  const [availableQualities, setAvailableQualities] = useState(['LOW', 'HIGH', 'LOSSLESS', 'HI_RES']);
  const [maxTrackQuality, setMaxTrackQuality] = useState('LOW');
  const [qualitiesReady, setQualitiesReady] = useState(false);
  const qualityActualRef = useRef({});
  const pendingSeekRef = useRef(null);
  const pendingPlayAfterSeekRef = useRef(false);
  const streamFallbackAttemptedRef = useRef(null);

  const setPlaybackQuality = useCallback((q) => {
    setPlaybackQualityState(q);
    setStoredPlaybackQuality(q);
  }, []);

  const applyQualityForTrack = useCallback((wanted, available, actualMap) => {
    const effective = pickQualityForPlan(wanted, available, effectivePlan);
    if (effective !== wanted) {
      setPlaybackQuality(effective);
      const planBlocked = !isQualityAllowedForPlan(wanted, effectivePlan);
      const msg = planBlocked
        ? (lang === 'ru' ? 'Для этого качества нужен платный тариф — переключено на 96k' : 'Upgrade plan for this quality — switched to 96k')
        : (lang === 'ru'
          ? `MAX недоступен для этого трека — переключено на ${effective === 'LOSSLESS' ? 'FLAC' : effective}`
          : `MAX not available for this track — switched to ${effective}`);
      showToast?.(msg);
    }
    const actual = actualMap?.[effective] || actualMap?.[available[available.length - 1]];
    if (actual) setActualQuality(actual);
  }, [effectivePlan, lang, setPlaybackQuality, showToast]);

  useEffect(() => {
    if (!enabled) {
      setCurrentAudioSrc('');
      setPreloadAudioSrc('');
      setQualitiesReady(true);
      setAvailableQualities(ALL_UI_QUALITIES);
      setMaxTrackQuality('LOW');
      qualityActualRef.current = {};
      streamFallbackAttemptedRef.current = null;
      return;
    }
    setPlaybackQualityState((q) => {
      const capped = clampQualityToPlan(q, effectivePlan);
      if (capped !== q) setStoredPlaybackQuality(capped);
      return capped;
    });
  }, [effectivePlan, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!currentTrack?.provider_id) {
      setAvailableQualities(ALL_UI_QUALITIES);
      setMaxTrackQuality('LOW');
      setQualitiesReady(true);
      qualityActualRef.current = {};
      streamFallbackAttemptedRef.current = null;
      return;
    }

    let cancelled = false;
    setQualitiesReady(false);
    streamFallbackAttemptedRef.current = null;
    setAvailableQualities(['LOW', 'HIGH', 'LOSSLESS']);

    const provider = currentTrack.provider || 'tidal';
    const trackId = currentTrack.provider_id;
    const cached = readQualityProbeCache(provider, trackId);
    const applyProbe = (data) => {
      if (cancelled || !data?.available?.length) {
        if (!cancelled) setQualitiesReady(true);
        return;
      }
      setAvailableQualities(data.available);
      setMaxTrackQuality(data.max_quality || data.available[data.available.length - 1]);
      qualityActualRef.current = data.actual || {};
      applyQualityForTrack(playbackQuality, data.available, data.actual);
      if (!cancelled) setQualitiesReady(true);
    };

    if (cached) {
      applyProbe(cached);
      return () => { cancelled = true; };
    }

    fetch(`/api/quality/${provider}/${trackId}/available`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.available?.length) {
          writeQualityProbeCache(provider, trackId, data);
        }
        applyProbe(data);
      })
      .catch(() => {
        if (!cancelled) setQualitiesReady(true);
      });

    return () => { cancelled = true; };
  }, [enabled, currentTrack?.provider_id, currentTrack?.provider, effectivePlan, applyQualityForTrack]);

  useEffect(() => {
    if (!enabled) return;
    if (!currentTrack?.provider_id || !qualitiesReady) return;
    const actual = qualityActualRef.current[playbackQuality];
    if (actual) {
      setActualQuality(actual);
      return;
    }
    fetch(`/api/quality/${currentTrack.provider}/${currentTrack.provider_id}?quality=${playbackQuality}`)
      .then((qRes) => (qRes.ok ? qRes.json() : null))
      .then((qData) => setActualQuality(qData?.quality || playbackQuality))
      .catch(() => setActualQuality(playbackQuality));
  }, [enabled, playbackQuality, currentTrack?.provider_id, currentTrack?.provider, qualitiesReady]);

  const trackKey = currentTrack?.provider_id
    ? `${currentTrack.provider || 'tidal'}:${currentTrack.provider_id}`
    : '';

  useEffect(() => {
    if (!enabled) {
      setCurrentAudioSrc('');
      setPreloadAudioSrc('');
      return undefined;
    }
    const updateAudioSrc = async () => {
      if (!currentTrack?.provider_id || !qualitiesReady) {
        if (!currentTrack?.provider_id) setCurrentAudioSrc('');
        return;
      }
      let url = await getCachedAudioUrl(currentTrack, playbackQuality);
      if (!url) {
        const isDownloaded = downloadedTracksRef.current.has(String(currentTrack.provider_id));
        const bypass = isDownloaded ? 'false' : 'true';
        const mt = await getMediaToken();
        url = `/api/stream/${currentTrack.provider}/${currentTrack.provider_id}?quality=${playbackQuality}&bypass_registry=${bypass}&mt=${mt}`;
      }
      setCurrentAudioSrc(url);
    };
    updateAudioSrc();
  }, [enabled, trackKey, playbackQuality, qualitiesReady, downloadRegistryTick, downloadedTracksRef, currentTrack]);

  const restorePendingSeek = useCallback(() => {
    if (pendingSeekRef.current == null || !audioRef?.current) return;
    const target = pendingSeekRef.current;
    const dur = audioRef.current.duration;
    if (dur && !Number.isNaN(dur) && target > dur) return;
    pendingSeekRef.current = null;
    audioRef.current.currentTime = target;
    setProgress?.(target);
    if (pendingPlayAfterSeekRef.current) {
      pendingPlayAfterSeekRef.current = false;
      audioRef.current.play().catch(() => setIsLoading?.(false));
    }
  }, [audioRef, setIsLoading]);

  const changeQuality = useCallback((newQ) => {
    if (newQ === playbackQuality) return;
    if (!isQualityAllowedForPlan(newQ, effectivePlan)) {
      showToast?.(lang === 'ru' ? 'Это качество доступно на платном тарифе' : 'This quality requires a paid plan');
      return;
    }
    if (!availableQualities.includes(newQ)) {
      showToast?.(lang === 'ru' ? 'Это качество недоступно для трека' : 'This quality is not available for this track');
      return;
    }
    const time = audioRef?.current?.currentTime || 0;
    pendingSeekRef.current = time;
    pendingPlayAfterSeekRef.current = isPlaying;
    streamFallbackAttemptedRef.current = null;
    setPlaybackQuality(newQ);
    setIsLoading?.(true);
  }, [playbackQuality, availableQualities, effectivePlan, audioRef, isPlaying, setPlaybackQuality, setIsLoading, lang, showToast]);

  const handleStreamError = useCallback(() => {
    const key = `${currentTrack?.provider_id}-${playbackQuality}`;
    if (streamFallbackAttemptedRef.current === key) {
      pendingPlayAfterSeekRef.current = false;
      setIsLoading?.(false);
      setIsPlaying?.(false);
      return;
    }
    const lower = lowerQualityTier(playbackQuality, availableQualities);
    if (lower && currentTrack) {
      streamFallbackAttemptedRef.current = key;
      showToast?.(
        lang === 'ru'
          ? `Ошибка потока — пробуем ${lower === 'LOSSLESS' ? 'FLAC' : lower}`
          : `Stream error — trying ${lower}`,
      );
      const time = audioRef?.current?.currentTime || 0;
      pendingSeekRef.current = time;
      pendingPlayAfterSeekRef.current = isPlaying;
      setPlaybackQuality(lower);
      setIsLoading?.(true);
      return;
    }
    pendingPlayAfterSeekRef.current = false;
    setIsLoading?.(false);
    setIsPlaying?.(false);
    showToast?.(lang === 'ru' ? 'Не удалось воспроизвести — войдите снова' : 'Playback failed — try logging in again');
  }, [
    currentTrack, playbackQuality, availableQualities, audioRef, isPlaying,
    setPlaybackQuality, setIsLoading, setIsPlaying, lang, showToast,
  ]);

  const updatePreloadForPlaylist = useCallback(async (playlist, currentTrackIndex) => {
    if (!qualitiesReady || !playlist?.length || currentTrackIndex < 0 || currentTrackIndex >= playlist.length - 1) {
      setPreloadAudioSrc('');
      return;
    }
    const nextTrack = playlist[currentTrackIndex + 1];
    let url = await getCachedAudioUrl(nextTrack, playbackQuality);
    if (!url) {
      const bypass = downloadedTracksRef.current.has(String(nextTrack.provider_id)) ? 'false' : 'true';
      url = `/api/stream/${nextTrack.provider}/${nextTrack.provider_id}?quality=${playbackQuality}&bypass_registry=${bypass}&mt=${await getMediaToken()}`;
    }
    setPreloadAudioSrc(url);
  }, [playbackQuality, qualitiesReady, downloadedTracksRef]);

  return {
    playbackQuality,
    setPlaybackQuality,
    currentAudioSrc,
    preloadAudioSrc,
    setPreloadAudioSrc,
    actualQuality,
    availableQualities,
    maxTrackQuality,
    qualitiesReady,
    qualitiesProbing: !qualitiesReady && !!currentTrack?.provider_id,
    changeQuality,
    restorePendingSeek,
    handleStreamError,
    pendingSeekRef,
    pendingPlayAfterSeekRef,
    updatePreloadForPlaylist,
  };
}
