import { useState, useRef, useEffect, useCallback } from 'react';
import { getCachedAudioUrl, prefetchAudioToCache, removeCachedAudioTrack } from '../utils/cache';
import { getMediaToken, resolveMediaTokenForStream } from '../utils/mediaToken';
import { apiFetch } from '../utils/apiClient';
import { hasAuthSession } from '../utils/hasAuthSession';
import {
  lowerQualityTier,
  setStoredPlaybackQuality,
  getStoredPlaybackQuality,
  pickQualityForPlan,
  isQualityAllowedForPlan,
  clampQualityToPlan,
  buildStreamSrcKey,
  resolveStreamBypass,
  sameStreamResource,
  isActivelyPlayingAudio,
  mergeProbeWithCatalogHint,
  sanitizeQualitiesForPlayer,
  visibleQualitiesForTrack,
  streamableQualitiesForTrack,
  pickMaxQualityForTrack,
  planMaxPlaybackQuality,
  qualitiesAllowedForPlan,
  isPlaybackQualityAvailable,
  isTidalCatalogOnlyLossless,
  isProbeReadyForTrack,
  qualityPreferenceFallbackToast,
  streamQualityTidalFallbackToast,
  qualityTierBlockedToast,
  shouldAnnounceQualityFallback,
} from '../utils/qualityPrefs';
import { readQualityProbeCache, writeQualityProbeCache } from '../utils/qualityProbeCache';
import { waitForLosslessStreamReady } from '../utils/streamReady';
import { shouldPreservePausedStream, shouldIgnoreStreamError } from '../utils/playerTransportLogic';

const LOSSLESS_TIERS = new Set(['LOSSLESS', 'HI_RES']);

function probeLosslessMeta(probe) {
  if (!probe?.lossless?.sample_rate) return {};
  return {
    sampleRate: probe.lossless.sample_rate,
    bitDepth: probe.lossless.bit_depth ?? null,
  };
}

function normalizeProbeResult(data, trackKey, catalogQuality) {
  if (!data?.available?.length) {
    return {
      available: ['HIGH'],
      downloadable: ['HIGH'],
      max: 'HIGH',
      actual: {},
      probeData: { available: ['HIGH'], max_quality: 'HIGH', actual: {}, _trackKey: trackKey },
    };
  }
  const raw = sanitizeQualitiesForPlayer(data.available);
  const probeMax = data.max_quality && data.max_quality !== 'LOW'
    ? data.max_quality
    : raw[raw.length - 1] || 'HIGH';
  const { available: merged, max } = mergeProbeWithCatalogHint(raw, probeMax, catalogQuality);
  const probeData = { ...data, _trackKey: trackKey };
  return {
    available: merged,
    downloadable: sanitizeQualitiesForPlayer(data.downloadable?.length ? data.downloadable : merged),
    max,
    actual: data.actual || {},
    probeData,
  };
}

/**
 * Per-track quality probe, stream URL, auto tier selection, and safe fallback.
 */
export function usePlaybackQuality({
  enabled = true,
  currentTrack,
  downloadedTracksRef,
  downloadedRegistryRef,
  downloadRegistryTick = 0,
  effectivePlan = 'free',
  autoQuality = true,
  onManualQualityPick,
  pendingPlayRef,
  lang,
  showToast,
  audioRef,
  getMainAudioEl,
  skipAudioSrcSyncRef,
  isPlaying,
  setIsLoading,
  setIsPlaying,
  setProgress,
  suppressQualityToastsRef,
}) {
  const [playbackQuality, setPlaybackQualityState] = useState(() =>
    clampQualityToPlan(getStoredPlaybackQuality(), effectivePlan),
  );
  const [streamQuality, setStreamQuality] = useState(playbackQuality);
  const [currentAudioSrc, setCurrentAudioSrc] = useState('');
  const [preloadAudioSrc, setPreloadAudioSrc] = useState('');
  const [actualQuality, setActualQuality] = useState('');
  const [deliveredStream, setDeliveredStream] = useState({ tier: '', sampleRate: null, bitDepth: null });
  const [availableQualities, setAvailableQualities] = useState(() => qualitiesAllowedForPlan(effectivePlan));
  const [downloadableQualities, setDownloadableQualities] = useState(['HIGH']);
  const [maxTrackQuality, setMaxTrackQuality] = useState('HIGH');
  const [qualitiesReady, setQualitiesReady] = useState(false);
  const [probeData, setProbeData] = useState(null);
  const [streamRetryNonce, setStreamRetryNonce] = useState(0);

  const qualityActualRef = useRef({});
  const probeDataRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const pendingPlayAfterSeekRef = useRef(false);
  const streamRetryNonceRef = useRef(0);
  const loadedSrcKeyRef = useRef('');
  const trackKeyRef = useRef('');
  const probeReadyTrackKeyRef = useRef('');
  const playbackQualityRef = useRef(playbackQuality);
  const streamQualityRef = useRef(streamQuality);
  const isPlayingRef = useRef(isPlaying);
  const trackChangePendingRef = useRef(false);
  const lastStreamErrorKeyRef = useRef('');
  const retryTimerRef = useRef(null);
  const warmInFlightRef = useRef('');
  const streamLoadGenRef = useRef(0);
  const qualitySwitchRef = useRef(false);
  const autoQualityRef = useRef(autoQuality);
  const streamErrorSuppressUntilRef = useRef(0);

  const resolveMainEl = useCallback(
    () => getMainAudioEl?.() ?? audioRef?.current ?? null,
    [getMainAudioEl, audioRef],
  );

  const trackKey = currentTrack?.provider_id
    ? `${currentTrack.provider || 'tidal'}:${currentTrack.provider_id}`
    : '';

  useEffect(() => { playbackQualityRef.current = playbackQuality; }, [playbackQuality]);
  useEffect(() => { streamQualityRef.current = streamQuality; }, [streamQuality]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { trackKeyRef.current = trackKey; }, [trackKey]);
  useEffect(() => { autoQualityRef.current = autoQuality; }, [autoQuality]);

  const setPlaybackQuality = useCallback((q) => {
    const capped = clampQualityToPlan(q, effectivePlan);
    setPlaybackQualityState(capped);
    setStreamQuality(capped);
    setStoredPlaybackQuality(capped);
  }, [effectivePlan]);

  const resolveWantedQuality = useCallback((wanted) => (
    autoQualityRef.current ? planMaxPlaybackQuality(effectivePlan) : clampQualityToPlan(wanted ?? playbackQualityRef.current, effectivePlan)
  ), [effectivePlan]);

  const updateDeliveredMeta = useCallback((tier, probe = null, meta = {}) => {
    const normalized = !tier || tier === 'LOW' || tier === 'HIGH'
      ? { tier: 'HIGH', sampleRate: null, bitDepth: null }
      : {
        tier,
        sampleRate: meta.sampleRate ?? meta.sample_rate ?? probe?.lossless?.sample_rate ?? null,
        bitDepth: meta.bitDepth ?? meta.bit_depth ?? probe?.lossless?.bit_depth ?? null,
      };
    setDeliveredStream(normalized);
    setActualQuality(normalized.tier);
  }, []);

  const probeMatchesTrack = useCallback((probe) => (
    !probe?._trackKey || probe._trackKey === trackKeyRef.current
  ), []);

  const applyStreamQuality = useCallback((
    wanted,
    visibleQualities,
    actualMap,
    { force = false, probe = null } = {},
  ) => {
    const activeProbe = probe ?? probeDataRef.current;
    if (activeProbe && !probeMatchesTrack(activeProbe)) return;

    const wantedQ = resolveWantedQuality(wanted);
    const streamable = streamableQualitiesForTrack(visibleQualities, activeProbe);
    const useAuto = autoQualityRef.current;
    const effective = useAuto
      ? pickMaxQualityForTrack(streamable, effectivePlan, activeProbe)
      : pickQualityForPlan(wantedQ, streamable, effectivePlan);

    const mainEl = resolveMainEl();
    const activelyPlaying = isActivelyPlayingAudio(isPlayingRef.current, mainEl)
      || (isPlayingRef.current && mainEl && !mainEl.paused);

    if (!force && useAuto && activelyPlaying && effective !== streamQualityRef.current) {
      // Auto won't switch the stream mid-track, so the badge must reflect what's
      // ACTUALLY playing (the current stream tier) — not the un-played auto-max.
      // Falling back to actualMap[effective] made a manual 320k pick visibly snap
      // back to Lossless a frame later.
      const keepActual = actualMap?.[streamQualityRef.current];
      updateDeliveredMeta(keepActual || streamQualityRef.current, activeProbe);
      return;
    }

    setStreamQuality(effective);
    if (useAuto) setPlaybackQualityState(effective);

    if (!useAuto && effective !== wantedQ) {
      const planBlocked = !isQualityAllowedForPlan(wantedQ, effectivePlan);
      const trackKeyNow = trackKeyRef.current;
      if (
        trackKeyNow
        && isProbeReadyForTrack(activeProbe, trackKeyNow)
        && shouldAnnounceQualityFallback({
          effective,
          suppressed: suppressQualityToastsRef?.current,
        })
      ) {
        showToast?.(qualityPreferenceFallbackToast(lang, {
          planBlocked,
          tidalCatalogOnly: isTidalCatalogOnlyLossless(activeProbe),
          pref: wantedQ,
          effective,
        }));
      }
      if (planBlocked) setStoredPlaybackQuality(effective);
    }

    const actual = actualMap?.[effective] || actualMap?.[visibleQualities[visibleQualities.length - 1]];
    if (actual) updateDeliveredMeta(actual, activeProbe, probeLosslessMeta(activeProbe));
  }, [
    autoQuality,
    effectivePlan,
    lang,
    probeMatchesTrack,
    resolveMainEl,
    resolveWantedQuality,
    showToast,
    updateDeliveredMeta,
    suppressQualityToastsRef,
  ]);

  const buildStreamUrl = useCallback(async (track, quality, bypass) => {
    if (!track?.provider_id) return '';
    const mt = await resolveMediaTokenForStream();
    if (!mt) return '';
    const provider = track.provider || 'tidal';
    const rn = streamRetryNonceRef.current;
    return `/api/stream/${provider}/${track.provider_id}?quality=${quality}&bypass_registry=${bypass}&mt=${encodeURIComponent(mt)}&_rn=${rn}`;
  }, []);

  const warmStream = useCallback(async (track, quality) => {
    if (!track?.provider_id || !LOSSLESS_TIERS.has(quality)) return;
    const provider = track.provider || 'tidal';
    const warmKey = `${provider}:${track.provider_id}:${quality}`;
    if (warmInFlightRef.current === warmKey) return;
    warmInFlightRef.current = warmKey;
    try {
      const mt = await getMediaToken();
      if (!mt) return;
      await apiFetch(
        `/api/stream/${provider}/${track.provider_id}/warm?quality=${quality}&mt=${encodeURIComponent(mt)}`,
        { method: 'POST', auth: true, lang, timeoutMs: 20000, retries: 0 },
      );
    } catch {
      /* warm is best-effort */
    } finally {
      if (warmInFlightRef.current === warmKey) warmInFlightRef.current = '';
    }
  }, [lang]);

  useEffect(() => {
    if (!enabled) {
      setCurrentAudioSrc('');
      setPreloadAudioSrc('');
      setQualitiesReady(true);
      setAvailableQualities(qualitiesAllowedForPlan(effectivePlan));
      setMaxTrackQuality('HIGH');
      qualityActualRef.current = {};
      probeDataRef.current = null;
      return;
    }
    const capped = clampQualityToPlan(playbackQualityRef.current, effectivePlan);
    setPlaybackQualityState(capped);
    setStreamQuality(capped);
    if (capped !== playbackQualityRef.current) setStoredPlaybackQuality(capped);
  }, [effectivePlan, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!currentTrack?.provider_id) {
      setAvailableQualities(qualitiesAllowedForPlan(effectivePlan));
      setDownloadableQualities(['HIGH']);
      setMaxTrackQuality('HIGH');
      setQualitiesReady(true);
      setProbeData(null);
      probeDataRef.current = null;
      qualityActualRef.current = {};
      loadedSrcKeyRef.current = '';
      if (skipAudioSrcSyncRef) skipAudioSrcSyncRef.current = null;
      return undefined;
    }

    let cancelled = false;
    trackChangePendingRef.current = true;
    streamErrorSuppressUntilRef.current = performance.now() + 1200;
    streamRetryNonceRef.current = 0;
    setStreamRetryNonce(0);
    lastStreamErrorKeyRef.current = '';
    loadedSrcKeyRef.current = '';
    if (skipAudioSrcSyncRef) skipAudioSrcSyncRef.current = null;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setQualitiesReady(false);
    if (pendingPlayRef?.current || isPlayingRef.current) {
      setIsLoading?.(true);
    }
    setProbeData(null);
    probeDataRef.current = null;
    qualityActualRef.current = {};
    updateDeliveredMeta('');
    setAvailableQualities(qualitiesAllowedForPlan(effectivePlan));
    setMaxTrackQuality('HIGH');

    const provider = currentTrack.provider || 'tidal';
    const trackId = currentTrack.provider_id;
    const localTrackKey = trackKey;
    const cached = readQualityProbeCache(provider, trackId);

    const finishProbe = (rawData) => {
      if (cancelled || trackKeyRef.current !== localTrackKey) return;
      const normalized = normalizeProbeResult(rawData, localTrackKey, currentTrack.quality);
      const visible = visibleQualitiesForTrack(
        normalized.available,
        normalized.max,
        effectivePlan,
        normalized.probeData,
      );
      const uiAvailable = visible.length ? visible : ['HIGH'];
      const uiDownloadable = normalized.downloadable.length ? normalized.downloadable : uiAvailable;

      probeDataRef.current = normalized.probeData;
      setProbeData(normalized.probeData);
      setAvailableQualities(uiAvailable);
      setDownloadableQualities(uiDownloadable);
      setMaxTrackQuality(normalized.max);
      qualityActualRef.current = normalized.actual;
      applyStreamQuality(
        playbackQualityRef.current,
        uiAvailable,
        normalized.actual,
        { force: true, probe: normalized.probeData },
      );
      probeReadyTrackKeyRef.current = localTrackKey;
      trackChangePendingRef.current = false;
      setQualitiesReady(true);
    };

    if (cached) {
      finishProbe(cached);
      return () => { cancelled = true; };
    }

    const qualityRequest = apiFetch(
      `/api/quality/${provider}/${trackId}/available`,
      { auth: hasAuthSession(), timeoutMs: 15000, retries: 0 },
    );

    qualityRequest
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.available?.length && data?.probe_complete !== false) {
          writeQualityProbeCache(provider, trackId, data);
        }
        finishProbe(data);
      })
      .catch(() => {
        if (!cancelled && trackKeyRef.current === localTrackKey) {
          finishProbe(null);
          showToast?.(lang === 'ru' ? 'Не удалось проверить качество трека' : 'Could not check track quality');
        }
      });

    return () => { cancelled = true; };
  }, [
    enabled,
    currentTrack?.provider_id,
    currentTrack?.provider,
    currentTrack?.quality,
    effectivePlan,
    applyStreamQuality,
    lang,
    showToast,
    trackKey,
    updateDeliveredMeta,
  ]);

  useEffect(() => {
    if (!enabled || !currentTrack?.provider_id || !qualitiesReady) return undefined;
    if (probeReadyTrackKeyRef.current === trackKey && availableQualities.length) {
      applyStreamQuality(
        playbackQualityRef.current,
        availableQualities,
        qualityActualRef.current,
      );
    }
    return undefined;
  }, [enabled, autoQuality, effectivePlan, trackKey, qualitiesReady, availableQualities, applyStreamQuality, currentTrack?.provider_id]);

  useEffect(() => {
    if (!enabled || !currentTrack?.provider_id || !qualitiesReady) return undefined;
    if (!probeMatchesTrack(probeDataRef.current)) return undefined;

    const probe = probeDataRef.current;
    const losslessMeta = probe?.lossless?.sample_rate
      ? { sampleRate: probe.lossless.sample_rate, bitDepth: probe.lossless.bit_depth ?? null }
      : null;
    const cachedActual = qualityActualRef.current[streamQuality];
    if (cachedActual && (!(streamQuality === 'LOSSLESS' || streamQuality === 'HI_RES') || losslessMeta)) {
      updateDeliveredMeta(cachedActual, probe, losslessMeta || {});
      return undefined;
    }

    const metaRequest = apiFetch(
      `/api/quality/${currentTrack.provider || 'tidal'}/${currentTrack.provider_id}?quality=${streamQuality}`,
      { auth: hasAuthSession(), timeoutMs: 15000, retries: 0 },
    );

    metaRequest
      .then((qRes) => (qRes.ok ? qRes.json() : null))
      .then((qData) => updateDeliveredMeta(
        qData?.quality || streamQuality,
        probe,
        { sampleRate: qData?.sample_rate, bitDepth: qData?.bit_depth },
      ))
      .catch(() => updateDeliveredMeta(cachedActual || streamQuality, probe, losslessMeta || {}));

    return undefined;
  }, [
    enabled,
    streamQuality,
    currentTrack?.provider_id,
    currentTrack?.provider,
    qualitiesReady,
    probeMatchesTrack,
    updateDeliveredMeta,
  ]);

  useEffect(() => {
    if (!enabled) {
      setCurrentAudioSrc('');
      setPreloadAudioSrc('');
      return undefined;
    }
    if (!currentTrack?.provider_id || !qualitiesReady || probeReadyTrackKeyRef.current !== trackKey) {
      return undefined;
    }

    let cancelled = false;
    const loadGen = streamLoadGenRef.current + 1;
    streamLoadGenRef.current = loadGen;
    streamErrorSuppressUntilRef.current = performance.now() + 800;
    const abortReady = new AbortController();

    const updateAudioSrc = async () => {
      const mainEl = resolveMainEl();
      const elSrc = mainEl?.currentSrc || mainEl?.src || '';
      const trackDur = Number(currentTrack?.duration_s ?? currentTrack?.duration ?? 0);
      const forceQualitySwitch = qualitySwitchRef.current;
      if (forceQualitySwitch) qualitySwitchRef.current = false;

      const pausedMidTrack = !forceQualitySwitch && shouldPreservePausedStream(
        mainEl,
        currentTrack?.provider_id,
        trackDur,
        { activeStreamUrl: elSrc || currentAudioSrc || '' },
      );

      if (pausedMidTrack && elSrc) {
        setCurrentAudioSrc((prev) => {
          if (prev && sameStreamResource(prev, elSrc)) return prev;
          return elSrc;
        });
        return;
      }

      if (pendingPlayRef?.current || forceQualitySwitch) {
        setIsLoading?.(true);
      }

      const activelyPlaying = !forceQualitySwitch
        && isActivelyPlayingAudio(isPlayingRef.current, mainEl);
      const skipUrl = skipAudioSrcSyncRef?.current;
      if (skipUrl) {
        const elSrc = mainEl?.currentSrc || mainEl?.src || '';
        if (sameStreamResource(skipUrl, elSrc)) {
          skipAudioSrcSyncRef.current = null;
          setCurrentAudioSrc((prev) => (sameStreamResource(prev, skipUrl) ? prev : skipUrl));
          return;
        }
        skipAudioSrcSyncRef.current = null;
      }

      const registryEntry = downloadedRegistryRef?.current?.[String(currentTrack.provider_id)];
      const bypass = resolveStreamBypass({
        registryEntry,
        streamQuality,
        trackKey,
        streamRetryNonce: streamRetryNonceRef.current,
        loadedSrcKey: loadedSrcKeyRef.current,
        activeStreamUrl: mainEl?.currentSrc || '',
        isActivelyPlaying: isActivelyPlayingAudio(isPlayingRef.current, mainEl),
        isPlaying: isPlayingRef.current,
      });

      let url = '';
      let fromCache = false;
      if (!activelyPlaying && !pausedMidTrack) {
        url = await getCachedAudioUrl(currentTrack, streamQuality);
        fromCache = Boolean(url);
      }
      if (!url) {
        if (LOSSLESS_TIERS.has(streamQuality) && !activelyPlaying && !pausedMidTrack) {
          setIsLoading?.(true);
          await warmStream(currentTrack, streamQuality);
        }
        url = await buildStreamUrl(currentTrack, streamQuality, bypass);
        if (!url) {
          showToast?.(lang === 'ru' ? 'Войдите снова для воспроизведения' : 'Log in again to play');
          return;
        }
        if (LOSSLESS_TIERS.has(streamQuality) && !fromCache) {
          setIsLoading?.(true);
          const ready = await waitForLosslessStreamReady(url, {
            timeoutMs: 120_000,
            intervalMs: 400,
            signal: abortReady.signal,
          });
          if (cancelled || loadGen !== streamLoadGenRef.current) return;
          if (!ready) {
            streamRetryNonceRef.current += 1;
            setStreamRetryNonce((n) => n + 1);
            return;
          }
        }
        if (!activelyPlaying && !pausedMidTrack && !LOSSLESS_TIERS.has(streamQuality)) {
          void prefetchAudioToCache(
            { ...currentTrack, provider: currentTrack.provider || 'tidal' },
            streamQuality,
          );
        }
      }

      if (cancelled || loadGen !== streamLoadGenRef.current) return;

      const srcKey = buildStreamSrcKey(trackKey, streamQuality, streamRetryNonceRef.current, bypass);
      loadedSrcKeyRef.current = srcKey;

      setCurrentAudioSrc((prev) => {
        if (sameStreamResource(prev, url)) return prev;
        const playingSrc = mainEl?.currentSrc || mainEl?.src || '';
        if (activelyPlaying) {
          if (playingSrc) return playingSrc;
          if (prev) return prev;
        }
        if (
          isActivelyPlayingAudio(isPlayingRef.current, mainEl)
          && sameStreamResource(playingSrc, url)
        ) {
          return playingSrc || url;
        }
        return url;
      });

      if (
        activelyPlaying
        && sameStreamResource(mainEl?.currentSrc || mainEl?.src || '', url)
      ) {
        setIsLoading?.(false);
      } else if (!fromCache && LOSSLESS_TIERS.has(streamQuality) && !activelyPlaying) {
        setIsLoading?.(true);
      }
    };

    updateAudioSrc();
    return () => {
      cancelled = true;
      abortReady.abort();
    };
  }, [
    enabled,
    trackKey,
    streamQuality,
    downloadRegistryTick,
    downloadedRegistryRef,
    currentTrack,
    buildStreamUrl,
    streamRetryNonce,
    qualitiesReady,
    lang,
    showToast,
    resolveMainEl,
    skipAudioSrcSyncRef,
    warmStream,
    setIsLoading,
  ]);

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
  }, [audioRef, setIsLoading, setProgress]);

  const requestPlaybackRetry = useCallback(() => {
    if (pendingPlayRef) pendingPlayRef.current = true;
    pendingPlayAfterSeekRef.current = isPlayingRef.current || pendingPlayAfterSeekRef.current;
    setIsLoading?.(true);
  }, [pendingPlayRef, setIsLoading]);

  const changeQuality = useCallback((newQ) => {
    const mainEl = resolveMainEl();
    const elSrc = mainEl?.currentSrc || mainEl?.src || '';
    const streamMatches = elSrc && (
      elSrc.includes(`quality=${newQ}&`)
      || elSrc.includes(`quality=${newQ}`)
    );
    if (newQ === playbackQuality && newQ === streamQualityRef.current && streamMatches) {
      return;
    }

    if (!isQualityAllowedForPlan(newQ, effectivePlan)) {
      showToast?.(lang === 'ru' ? 'Это качество доступно на платном тарифе' : 'This quality requires a paid plan');
      return;
    }
    if (!isPlaybackQualityAvailable(newQ, availableQualities, maxTrackQuality, effectivePlan, probeDataRef.current)) {
      showToast?.(qualityTierBlockedToast(lang, {
        tidalCatalogOnly: isTidalCatalogOnlyLossless(probeDataRef.current) && newQ === 'LOSSLESS',
      }));
      return;
    }
    if (autoQuality) {
      onManualQualityPick?.();
      autoQualityRef.current = false;
    }
    qualitySwitchRef.current = true;
    streamErrorSuppressUntilRef.current = performance.now() + 800;
    const time = audioRef?.current?.currentTime || 0;
    pendingSeekRef.current = time;
    pendingPlayAfterSeekRef.current = isPlaying;
    lastStreamErrorKeyRef.current = '';
    streamRetryNonceRef.current += 1;
    setStreamRetryNonce((n) => n + 1);
    loadedSrcKeyRef.current = '';
    setPlaybackQuality(newQ);
    applyStreamQuality(newQ, availableQualities, qualityActualRef.current, {
      force: true,
      probe: probeDataRef.current,
    });
    const actual = qualityActualRef.current[newQ];
    updateDeliveredMeta(actual || newQ, probeDataRef.current);
    setIsLoading?.(true);
    requestPlaybackRetry();
  }, [
    playbackQuality,
    availableQualities,
    maxTrackQuality,
    effectivePlan,
    autoQuality,
    onManualQualityPick,
    audioRef,
    resolveMainEl,
    isPlaying,
    setPlaybackQuality,
    setIsLoading,
    lang,
    showToast,
    updateDeliveredMeta,
    requestPlaybackRetry,
    applyStreamQuality,
  ]);

  const handleStreamError = useCallback(async () => {
    const mainEl = resolveMainEl();
    const activeSrc = mainEl?.currentSrc || mainEl?.src || '';
    if (shouldIgnoreStreamError({
      activeSrc,
      currentTrackId: currentTrack?.provider_id,
      currentAudioSrc,
      suppressUntilMs: streamErrorSuppressUntilRef.current,
      trackChangePending: trackChangePendingRef.current,
    })) {
      return;
    }
    if (!pendingPlayRef?.current && !isPlayingRef.current) return;

    const errorKey = `${currentTrack?.provider_id}-${streamQuality}-${streamRetryNonceRef.current}`;
    if (lastStreamErrorKeyRef.current === errorKey) {
      pendingPlayAfterSeekRef.current = false;
      if (pendingPlayRef) pendingPlayRef.current = false;
      setIsLoading?.(false);
      setIsPlaying?.(false);
      return;
    }
    lastStreamErrorKeyRef.current = errorKey;

    const neverStarted = (mainEl?.currentTime || 0) < 0.5;
    const isLossless = streamQuality === 'LOSSLESS' || streamQuality === 'HI_RES';
    const probe = probeDataRef.current;
    const qualityUnavailable = !isPlaybackQualityAvailable(
      streamQuality,
      availableQualities,
      maxTrackQuality,
      effectivePlan,
      probe,
    );
    const lower = lowerQualityTier(streamQuality, availableQualities);

    const applyQualityFallback = async (nextQuality, { toast } = {}) => {
      if (!currentTrack || !nextQuality) return false;
      if (toast) showToast?.(toast);
      const time = mainEl?.currentTime || 0;
      if (time > 0) pendingSeekRef.current = time;
      pendingPlayAfterSeekRef.current = isPlayingRef.current || pendingPlayRef?.current;
      await removeCachedAudioTrack(currentTrack, streamQuality);
      setStreamQuality(nextQuality);
      if (autoQuality) setPlaybackQualityState(nextQuality);
      streamRetryNonceRef.current = 0;
      setStreamRetryNonce(0);
      loadedSrcKeyRef.current = '';
      lastStreamErrorKeyRef.current = '';
      setIsLoading?.(true);
      requestPlaybackRetry();
      return true;
    };

    if (lower && currentTrack && qualityUnavailable) {
      const tidalOnly = probeMatchesTrack(probe) && isTidalCatalogOnlyLossless(probe)
        && (streamQuality === 'LOSSLESS' || streamQuality === 'HI_RES');
      const announce = shouldAnnounceQualityFallback({
        lower,
        suppressed: suppressQualityToastsRef?.current,
      });
      const toast = announce
        ? (tidalOnly
          ? streamQualityTidalFallbackToast(lang, { quality: lower })
          : (lang === 'ru'
            ? `Ошибка потока — пробуем ${lower === 'LOSSLESS' ? 'FLAC' : '320k'}`
            : `Stream error — trying ${lower === 'LOSSLESS' ? 'Lossless' : '320k'}`))
        : undefined;
      await applyQualityFallback(lower, { toast });
      return;
    }

    const maxSilentRetries = neverStarted ? (isLossless ? 10 : 1) : 3;
    if (currentTrack && streamRetryNonceRef.current < maxSilentRetries) {
      const time = mainEl?.currentTime || 0;
      if (time > 0) pendingSeekRef.current = time;
      pendingPlayAfterSeekRef.current = isPlayingRef.current || pendingPlayRef?.current;
      await removeCachedAudioTrack(currentTrack, streamQuality);
      await getMediaToken({ force: true });
      const delay = neverStarted
        ? (isLossless ? Math.min(800 * (2 ** streamRetryNonceRef.current), 6000) : 400)
        : Math.min(1200 * (2 ** streamRetryNonceRef.current), 6000);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        streamRetryNonceRef.current += 1;
        setStreamRetryNonce((n) => n + 1);
        loadedSrcKeyRef.current = '';
        lastStreamErrorKeyRef.current = '';
        setIsLoading?.(true);
        requestPlaybackRetry();
      }, delay);
      return;
    }

    if (lower && currentTrack) {
      const msg = lang === 'ru'
        ? `Ошибка потока — пробуем ${lower === 'LOSSLESS' ? 'FLAC' : '320k'}`
        : `Stream error — trying ${lower === 'LOSSLESS' ? 'Lossless' : '320k'}`;
      await applyQualityFallback(lower, { toast: msg });
      return;
    }

    pendingPlayAfterSeekRef.current = false;
    if (pendingPlayRef) pendingPlayRef.current = false;
    setIsLoading?.(false);
    setIsPlaying?.(false);
    const loggedIn = hasAuthSession();
    showToast?.(
      loggedIn
        ? (lang === 'ru' ? 'Не удалось воспроизвести этот трек' : 'Could not play this track')
        : (lang === 'ru' ? 'Войдите снова для воспроизведения' : 'Log in again to play'),
    );
  }, [
    currentTrack,
    streamQuality,
    availableQualities,
    maxTrackQuality,
    effectivePlan,
    currentAudioSrc,
    autoQuality,
    pendingPlayRef,
    resolveMainEl,
    lang,
    showToast,
    probeMatchesTrack,
    setIsLoading,
    setIsPlaying,
    requestPlaybackRetry,
  ]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const updatePreloadForPlaylist = useCallback(async (playlist, currentTrackIndex) => {
    if (!qualitiesReady || !playlist?.length || currentTrackIndex < 0 || currentTrackIndex >= playlist.length - 1) {
      setPreloadAudioSrc('');
      return;
    }
    const nextTrack = playlist[currentTrackIndex + 1];
    let url = await getCachedAudioUrl(nextTrack, streamQuality);
    if (!url) {
      const bypass = downloadedTracksRef.current.has(String(nextTrack.provider_id)) ? 'false' : 'true';
      url = await buildStreamUrl(nextTrack, streamQuality, bypass);
      if (url && !LOSSLESS_TIERS.has(streamQuality)) {
        void prefetchAudioToCache(
          { ...nextTrack, provider: nextTrack.provider || 'tidal' },
          streamQuality,
        );
      }
    }
    setPreloadAudioSrc(url || '');
  }, [playbackQuality, streamQuality, qualitiesReady, downloadedTracksRef, buildStreamUrl, streamRetryNonce]);

  return {
    playbackQuality,
    setPlaybackQuality,
    streamQuality,
    currentAudioSrc,
    setCurrentAudioSrc,
    preloadAudioSrc,
    setPreloadAudioSrc,
    actualQuality,
    deliveredStream: deliveredStream.tier ? deliveredStream : null,
    availableQualities,
    downloadableQualities,
    probeData,
    maxTrackQuality,
    qualitiesReady,
    qualitiesProbing: !qualitiesReady && !!currentTrack?.provider_id,
    deferPlayUntilReady: false,
    changeQuality,
    restorePendingSeek,
    handleStreamError,
    pendingSeekRef,
    pendingPlayAfterSeekRef,
    updatePreloadForPlaylist,
  };
}
