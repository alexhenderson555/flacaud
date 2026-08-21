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
import { shouldPreservePausedStream, shouldIgnoreStreamError, urlTargetsTrack } from '../utils/playerTransportLogic';
import { probeLosslessMeta, normalizeProbeResult } from '../utils/qualityProbeHelpers';
import { isFeatureEnabled } from '../utils/featureFlags';
import { startMseStream } from '../utils/mseStream';

const LOSSLESS_TIERS = new Set(['LOSSLESS', 'HI_RES']);

/**
 * Per-track quality probe, stream URL, auto tier selection, and safe fallback.
 */
export function usePlaybackQuality({
  enabled = true,
  planReady = true,
  currentTrack,
  downloadedTracksRef,
  downloadedRegistryRef,
  downloadRegistryTick = 0,
  effectivePlan = 'free',
  autoQuality = true,
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
  const [trackOverrideQuality, setTrackOverrideQuality] = useState(null);
  const [playbackQuality, setPlaybackQualityState] = useState(() => getStoredPlaybackQuality());
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
  // Which track pendingSeekRef's timestamp belongs to (provider:provider_id).
  // restorePendingSeek only had a "does the timestamp fit this element's
  // duration" check, no track-identity check — a stale pending seek recorded
  // for the previous track could still slip through and get applied to a
  // freshly-switched track that happens to have a longer duration, if the
  // switch and the pending-seek write race within the same tick (e.g. the
  // seek-bar's handleSeekCommit firing just as the user switches tracks).
  // This is a second, independent guard on top of the track-change reset
  // effect below, which only clears pendingSeekRef itself.
  const pendingSeekTrackKeyRef = useRef('');
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
  // Guards the experimental MSE path (mseLossless flag) against re-attempting
  // a fresh fetch()+MediaSource for a src-key it already resolved — this
  // effect can legitimately re-run for reasons unrelated to actually needing
  // a new stream (see downloadRegistryTick etc. in its deps below), and unlike
  // the plain-URL path below (an idempotent string build, safe to recompute),
  // starting MSE has a real side effect (a live fetch + MediaSource) that
  // isn't safe to redo without tearing down the previous one first.
  const mseAttemptedSrcKeyRef = useRef('');
  const mseAbortRef = useRef(null);
  // Guards against concurrent updatePreloadForPlaylist invocations. The caller
  // (usePlayerMediaEffects) re-runs its own effect -- and re-invokes this
  // callback -- on several unrelated dependency changes; without this, a
  // previous call's serialized "upcoming tracks" loop keeps running while a
  // new call starts its own, so the same track IDs get hit repeatedly and
  // concurrently, which is exactly the resource contention the serialization
  // was meant to prevent in the first place. streamLoadGenRef only changes on
  // a real track change, so it can't detect this.
  const preloadRunIdRef = useRef(0);
  const qualitySwitchRef = useRef(false);
  const autoQualityRef = useRef(autoQuality);
  const streamErrorSuppressUntilRef = useRef(0);
  // Mirrors trackOverrideQuality for synchronous reads (set directly alongside the
  // state setter, not solely via a useEffect mirror) — applyStreamQuality is called
  // in the same tick right after the override is set and needs the current value
  // immediately, before React would otherwise re-render and run the mirror effect.
  const trackOverrideQualityRef = useRef(null);

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

  const setPlaybackQuality = useCallback((q, isOverride = false) => {
    if (isOverride) {
      trackOverrideQualityRef.current = q;
      setTrackOverrideQuality(q);
      setStreamQuality(q);
      return;
    }
    const capped = clampQualityToPlan(q, effectivePlan);
    setPlaybackQualityState(capped);
    setStreamQuality(capped);
    setStoredPlaybackQuality(capped);
  }, [effectivePlan]);

  const resolveWantedQuality = useCallback((wanted) => (
    autoQualityRef.current ? planMaxPlaybackQuality(effectivePlan) : clampQualityToPlan(wanted ?? playbackQualityRef.current, effectivePlan)
  ), [effectivePlan]);

  const updateDeliveredMeta = useCallback((tier, probe = null, meta = {}) => {
    // An empty `tier` means "reset, nothing delivered yet for the new track"
    // (called on every track change) -- it must NOT collapse into the same
    // shape as a real HIGH/320k delivery, or the UI can't tell "we don't
    // know yet" apart from "320k was genuinely just delivered". That
    // ambiguity is exactly what let a stale/placeholder 320k badge render
    // simultaneously with the new track's real (lossless) info once the
    // probe caught up -- a visible race between two independently-updating
    // pieces of state. Keeping tier="" here lets the hook's own
    // `deliveredStream.tier ? deliveredStream : null` return null during
    // that gap, so callers correctly fall back to the requested tier
    // instead of asserting a false delivered one.
    if (!tier) {
      setDeliveredStream({ tier: '', sampleRate: null, bitDepth: null });
      setActualQuality('');
      return;
    }
    const normalized = tier === 'LOW' || tier === 'HIGH'
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
    // A player-picked quality (changeQuality) is a one-time, per-track override — it
    // takes priority over both Auto and the fixed default, and is NOT what's saved
    // as the profile's default (that only happens via setPlaybackQuality's non-override
    // branch, from the Account settings page). It's cleared on track change.
    const overrideQ = trackOverrideQualityRef.current;
    const effective = overrideQ
      ? pickQualityForPlan(overrideQ, streamable, effectivePlan)
      : useAuto
        ? pickMaxQualityForTrack(streamable, effectivePlan, activeProbe)
        : pickQualityForPlan(wantedQ, streamable, effectivePlan);

    const mainEl = resolveMainEl();
    const playingSrc = mainEl?.currentSrc || mainEl?.src || '';
    // "Mid-track" only counts if the element is actually playing THIS track. During a
    // track switch the element still briefly reports the previous track as playing —
    // if we treat that as mid-track we skip setStreamQuality, the stream-resolve effect
    // (keyed on streamQuality) never re-runs, and the new track never loads until the
    // user pokes quality manually. This only bit when adjacent tracks resolved to
    // different tiers (e.g. Automatic 320 → lossless); same-tier switches were unaffected.
    const playingCurrentTrack = urlTargetsTrack(playingSrc, trackKeyRef.current.split(':').pop());
    const activelyPlaying = playingCurrentTrack
      && (isActivelyPlayingAudio(isPlayingRef.current, mainEl)
        || (isPlayingRef.current && mainEl && !mainEl.paused));
    // Only suppress Auto's mid-track upgrade once real listening is underway. Right
    // after a track starts, the per-track quality probe can resolve a beat after
    // playback begins (started at a lower tier while probing) — that's not "the user
    // is mid-listening, don't disrupt them", it's the normal startup race, and Auto
    // should still be allowed to correct up to the real max within the first few
    // seconds instead of sitting at the lower tier for the rest of the track.
    const justStartedTrack = (mainEl?.currentTime || 0) < 4;

    if (!force && useAuto && activelyPlaying && !justStartedTrack && effective !== streamQualityRef.current) {
      // Auto won't switch the stream mid-track, so the badge must reflect what's
      // ACTUALLY playing (the current stream tier) — not the un-played auto-max.
      // Falling back to actualMap[effective] made a manual 320k pick visibly snap
      // back to Lossless a frame later.
      //
      // actualMap can be momentarily stale/incomplete relative to
      // streamQualityRef.current (e.g. a probe update landing between the
      // forced call that set the real stream tier and this guard re-running).
      // Falling back to the bare tier KEY in that case fed updateDeliveredMeta
      // a value it treats as if it were the real delivered-quality result —
      // showing e.g. "HIGH/320k" from the tier name alone, overwriting the
      // correct badge the earlier forced call had already set. Skip the
      // update entirely instead of guessing: leave whatever's already shown.
      const keepActual = actualMap?.[streamQualityRef.current];
      if (keepActual) updateDeliveredMeta(keepActual, activeProbe);
      return;
    }

    setStreamQuality(effective);
    if (useAuto && !overrideQ) setPlaybackQualityState(effective);

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

  const buildMseStreamUrl = useCallback(async (track, quality) => {
    if (!track?.provider_id) return '';
    const mt = await resolveMediaTokenForStream();
    if (!mt) return '';
    const provider = track.provider || 'tidal';
    return `/api/stream/${provider}/${track.provider_id}/mse?quality=${quality}&mt=${encodeURIComponent(mt)}`;
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

  // Kick off the DASH resolve+download+remux the instant a track becomes
  // `currentTrack` — not when resolveStreamUrl later needs actual bytes.
  // LOSSLESS/HI_RES DASH remux is a flat ~10s cost (see streaming.py
  // `ensure_dash_cache` / `_remux`) that cannot be safely shortened by serving
  // the pre-remux fMP4 progressively — that was tried before and reverted
  // (see `find_merged_dash_file`'s "never intermediate .fmp4, causes
  // play-then-restart" comment in server/streaming.py). Starting the warm here,
  // in parallel with the quality probe, lets the remux run during whatever
  // idle time exists between track selection and the user actually pressing
  // play, instead of serializing it after play is pressed.
  useEffect(() => {
    if (!enabled || !currentTrack?.provider_id) return undefined;
    const capped = clampQualityToPlan(playbackQualityRef.current, effectivePlan);
    if (!LOSSLESS_TIERS.has(capped)) return undefined;
    void warmStream(currentTrack, capped);
    return undefined;
  }, [enabled, currentTrack?.provider_id, currentTrack?.provider, effectivePlan, warmStream]);

  useEffect(() => {
    if (!enabled || !planReady) {
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
  }, [effectivePlan, enabled, planReady]);

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
      pendingSeekRef.current = null;
      pendingSeekTrackKeyRef.current = '';
      pendingPlayAfterSeekRef.current = false;
      mseAbortRef.current?.abort();
      mseAbortRef.current = null;
      mseAttemptedSrcKeyRef.current = '';
      return undefined;
    }

    let cancelled = false;
    trackOverrideQualityRef.current = null;
    setTrackOverrideQuality(null);
    // A quality-change or stream-error retry on the PREVIOUS track can stage a
    // resume position (to restore playback position across a stream reload) that
    // never gets consumed if the user switches tracks before it fires. Left
    // uncleared, restorePendingSeek has no track-identity check — only "is the
    // timestamp within this element's duration" — so it would happily seek the
    // NEW track to the old one's leftover position on its first loadedmetadata.
    // This is what surfaced as tracks starting at an unrelated ~20-45s offset.
    pendingSeekRef.current = null;
    pendingSeekTrackKeyRef.current = '';
    pendingPlayAfterSeekRef.current = false;
    mseAbortRef.current?.abort();
    mseAbortRef.current = null;
    mseAttemptedSrcKeyRef.current = '';
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

      // Only preserve a paused stream if the element's LOADED stream actually belongs to
      // the current track. On a track switch the element is briefly paused on the previous
      // track's src; for a blob src, shouldPreservePausedStream's blob branch would compare
      // the src to itself (activeStreamUrl = the element's own src) and always match, wrongly
      // preserving the OLD blob → the previous track keeps playing. (Server-URL srcs dodged
      // this via urlTargetsTrack, which is why clearing the audio cache "fixed" it.)
      const loadedIsCurrentTrack = Boolean(trackKey) && loadedSrcKeyRef.current.startsWith(`${trackKey}:`);
      const pausedMidTrack = !forceQualitySwitch && loadedIsCurrentTrack && shouldPreservePausedStream(
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

      // Already playing the right src for this exact track+quality and
      // nothing forced a re-resolve -- bail out before touching anything
      // else. This effect also reruns on downloadRegistryTick/
      // downloadedRegistryRef (needed so a *not-yet-playing* track picks up
      // a freshly-finished download), but for a track that's mid-playback,
      // recomputing `bypass` below can flip bypass_registry in the rebuilt
      // URL -- a different query string that fails the exact-string
      // sameStreamResource() check further down and gets reassigned to
      // <audio>.src, restarting playback from 0. Reproduced by downloading
      // a still-loading lossless track while it was already playing.
      // (Only checks trackKey+streamQuality, not retry-nonce/bypass, so a
      // genuine mid-track quality change -- which changes streamQuality --
      // still falls through and re-resolves normally.)
      const alreadyLoadedForTrackAndQuality = Boolean(trackKey)
        && loadedSrcKeyRef.current.startsWith(`${trackKey}:${streamQuality}:`);
      if (activelyPlaying && alreadyLoadedForTrackAndQuality) {
        return;
      }

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

        // Experimental (mseLossless flag): play the raw DASH segments as they
        // arrive instead of waiting for the server's full download+remux
        // below. Only attempted once per exact src-key (see mseAttemptedSrcKeyRef's
        // comment) — this effect can re-run for unrelated reasons, and unlike
        // buildStreamUrl (a pure string, safe to recompute) this has a real
        // side effect. Any failure/unsupported-codec falls straight through
        // to the existing behavior below, unchanged.
        const mseSrcKey = LOSSLESS_TIERS.has(streamQuality) && !fromCache
          ? buildStreamSrcKey(trackKey, streamQuality, streamRetryNonceRef.current, 'mse')
          : '';
        // A stale MSE stream from a previous key (quality changed, retry
        // bumped the nonce, or we're no longer taking the MSE path at all —
        // e.g. a fallback to HIGH after an error) is no longer wanted even
        // if we don't end up starting a new one below.
        if (mseAbortRef.current && mseAttemptedSrcKeyRef.current !== mseSrcKey) {
          mseAbortRef.current.abort();
          mseAbortRef.current = null;
        }
        if (
          mseSrcKey
          && isFeatureEnabled('mseLossless')
          && !activelyPlaying
          && !pausedMidTrack
          && mseAttemptedSrcKeyRef.current !== mseSrcKey
        ) {
          mseAttemptedSrcKeyRef.current = mseSrcKey;
          const mseUrl = await buildMseStreamUrl(currentTrack, streamQuality);
          if (cancelled || loadGen !== streamLoadGenRef.current) return;
          if (mseUrl) {
            const trackDurationSec = Number(currentTrack?.duration_s ?? currentTrack?.duration ?? 0) || undefined;
            const mseResult = await startMseStream(mseUrl, {
              signal: abortReady.signal,
              trackDurationSec,
            });
            if (cancelled || loadGen !== streamLoadGenRef.current) {
              mseResult?.abort();
              return;
            }
            if (mseResult) {
              mseAbortRef.current?.abort();
              mseAbortRef.current = mseResult.abort;
              url = mseResult.blobUrl;
            }
          }
        }

        if (!url) {
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
        }
        if (!activelyPlaying && !pausedMidTrack) {
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
        // Only preserve the element's current src if it belongs to THIS track (a
        // mid-playback quality re-resolve). On a track switch the element may still
        // briefly read as "playing" the previous track — never keep that, or every
        // next-press replays the same track. This was reproducible on 320, where the
        // cache path resolves before the switch settles (lossless's warm-up delay hid it).
        const playingIsCurrentTrack = urlTargetsTrack(playingSrc, currentTrack?.provider_id);
        if (activelyPlaying && playingIsCurrentTrack) {
          if (playingSrc) return playingSrc;
          if (prev) return prev;
        }
        if (
          playingIsCurrentTrack
          && isActivelyPlayingAudio(isPlayingRef.current, mainEl)
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
      // Deliberately NOT aborting mseAbortRef here: this effect's cleanup
      // fires on every re-run, including ones unrelated to the actual stream
      // (e.g. downloadRegistryTick ticking for some other track) — killing a
      // live MSE stream on every such wobble would audibly interrupt
      // playback for no reason. Starting a genuinely new attempt already
      // aborts the previous one first (see mseAbortRef.current?.abort()
      // above); teardown for "switched away entirely" belongs to the
      // trackKey-keyed reset effect below, which only fires on a real track
      // change.
    };
    // currentTrack is intentionally NOT a dependency -- trackKey already
    // identifies which track this effect is resolving a src for. playQueue's
    // "same track already playing" branch (e.g. starting Track Radio from the
    // currently-playing track) still calls setCurrentTrack with a freshly
    // merged object every time, even though the track itself hasn't changed.
    // Depending on that object by reference reran this effect on every such
    // merge. For an uncached track buildStreamUrl deterministically returns
    // the same server URL string, so the "same resource" check below caught
    // it -- but for a track already in the offline/prefetch cache,
    // getCachedAudioUrl mints a brand new blob: URL each call (different
    // string, identical bytes), which failed that check and got reassigned
    // to <audio>.src, resetting playback to 0. Hence "restarts only if
    // cached".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    trackKey,
    streamQuality,
    downloadRegistryTick,
    downloadedRegistryRef,
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
    // Belt-and-suspenders track-identity check: the reset effect above clears
    // pendingSeekRef on track change, but if a write to it (e.g. a seek-bar
    // commit or a quality-retry) races that reset within the same tick, a
    // stale timestamp meant for the PREVIOUS track could still be pending
    // here. Discard rather than apply it if it isn't tagged for the track
    // that's current right now.
    if (pendingSeekTrackKeyRef.current && pendingSeekTrackKeyRef.current !== trackKeyRef.current) {
      pendingSeekRef.current = null;
      pendingSeekTrackKeyRef.current = '';
      pendingPlayAfterSeekRef.current = false;
      return;
    }
    const target = pendingSeekRef.current;
    const dur = audioRef.current.duration;
    if (dur && !Number.isNaN(dur) && target > dur) return;
    pendingSeekRef.current = null;
    pendingSeekTrackKeyRef.current = '';
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
    // Already there — via a prior override (Auto mode) or the fixed default — nothing to do.
    if ((newQ === trackOverrideQuality || newQ === playbackQuality)
      && newQ === streamQualityRef.current && streamMatches) {
      return;
    }

    if (!isQualityAllowedForPlan(newQ, effectivePlan)) {
      showToast?.(lang === 'ru' ? 'Это качество доступно на платном тарифе' : 'This quality requires a paid plan');
      return;
    }
    // Only enforce the per-track availability gate once we've actually probed the
    // current track. On a fresh load (no track probed yet) maxTrackQuality is the
    // 'HIGH' placeholder, which would wrongly block selecting a plan-allowed tier
    // like Lossless. The chosen tier downgrades per track later if truly needed.
    const hasProbeForTrack = probeDataRef.current && probeReadyTrackKeyRef.current === trackKeyRef.current;
    if (hasProbeForTrack
      && !isPlaybackQualityAvailable(newQ, availableQualities, maxTrackQuality, effectivePlan, probeDataRef.current)) {
      showToast?.(qualityTierBlockedToast(lang, {
        tidalCatalogOnly: isTidalCatalogOnlyLossless(probeDataRef.current) && newQ === 'LOSSLESS',
      }));
      return;
    }
    // Always a one-time, per-track override — never persisted, never touches the
    // profile's saved default or the Automatic toggle (those only change via the
    // Account settings page). Automatic keeps picking its own tier for the NEXT
    // track once this one ends (trackOverrideQuality resets on track change).
    setPlaybackQuality(newQ, true);
    qualitySwitchRef.current = true;
    streamErrorSuppressUntilRef.current = performance.now() + 800;
    const time = audioRef?.current?.currentTime || 0;
    pendingSeekRef.current = time;
    pendingSeekTrackKeyRef.current = trackKeyRef.current;
    pendingPlayAfterSeekRef.current = isPlaying;
    lastStreamErrorKeyRef.current = '';
    streamRetryNonceRef.current += 1;
    setStreamRetryNonce((n) => n + 1);
    loadedSrcKeyRef.current = '';
    applyStreamQuality(newQ, availableQualities, qualityActualRef.current, {
      force: true,
      probe: probeDataRef.current,
      override: newQ,
    });
    const actual = qualityActualRef.current[newQ];
    updateDeliveredMeta(actual || newQ, probeDataRef.current);
    setIsLoading?.(true);
    requestPlaybackRetry();
  }, [
    playbackQuality,
    trackOverrideQuality,
    availableQualities,
    maxTrackQuality,
    effectivePlan,
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
      if (time > 0) {
        pendingSeekRef.current = time;
        pendingSeekTrackKeyRef.current = trackKeyRef.current;
      }
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

    // Cap silent retries so a persistent server 503 (stream_failed) can't spin the
    // loader for ~40s. Lossless still gets a few (DASH assembly is genuinely slower)
    // before we fall back a quality tier / give up with a toast.
    const maxSilentRetries = neverStarted ? (isLossless ? 3 : 1) : 3;
    if (currentTrack && streamRetryNonceRef.current < maxSilentRetries) {
      const time = mainEl?.currentTime || 0;
      if (time > 0) {
        pendingSeekRef.current = time;
        pendingSeekTrackKeyRef.current = trackKeyRef.current;
      }
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

  // With only one Lossless-capable Tidal account currently in the server's
  // pool (see the account-pool health checks), each background prefetch here
  // competes directly with whatever's actively playing for that single
  // account's capacity -- observed in prod as the live track's own stream
  // stalling for 20+ seconds while 3 upcoming tracks warmed concurrently.
  // 1 keeps the "instant next track" benefit without piling on more
  // concurrent speculative downloads than the pool can currently absorb.
  const PRELOAD_CACHE_AHEAD = 1;

  const updatePreloadForPlaylist = useCallback(async (playlist, currentTrackIndex) => {
    // usePlayerMediaEffects re-invokes this on several unrelated dependency
    // changes (not just a real track change), so a fresh call must invalidate
    // whatever the previous call's in-flight loop below is still doing --
    // otherwise both run concurrently against the same track IDs.
    const runId = (preloadRunIdRef.current += 1);

    if (!qualitiesReady || !playlist?.length || currentTrackIndex < 0 || currentTrackIndex >= playlist.length - 1) {
      setPreloadAudioSrc('');
      return;
    }
    const nextTrack = playlist[currentTrackIndex + 1];
    let url = await getCachedAudioUrl(nextTrack, streamQuality);
    if (preloadRunIdRef.current !== runId) return;
    if (!url) {
      const bypass = downloadedTracksRef.current.has(String(nextTrack.provider_id)) ? 'false' : 'true';
      url = await buildStreamUrl(nextTrack, streamQuality, bypass);
      if (preloadRunIdRef.current !== runId) return;
      if (url) {
        void prefetchAudioToCache(
          { ...nextTrack, provider: nextTrack.provider || 'tidal' },
          streamQuality,
        );
      }
    }
    setPreloadAudioSrc(url || '');

    // Beyond the immediate next track (which needs a resolved src for instant
    // playback above), just warm a few more tracks into the offline cache in the
    // background — no src resolution needed since nothing plays them yet.
    //
    // Firing all of these at once (the old forEach + fire-and-forget) opened
    // PRELOAD_CACHE_AHEAD extra concurrent stream sessions against the same
    // backend Tidal account pool the currently-PLAYING track's own stream
    // depends on. Individual-tier Tidal accounts allow only one concurrent
    // stream -- when the pool has few (or, as observed in production, just
    // one) accounts with quota left, these speculative preloads could steal
    // the account the live stream needed mid-track, cutting it off outright.
    // Serializing them (one in flight at a time, awaited before the next
    // starts) keeps worst-case concurrent stream usage at "live + one
    // preload" instead of "live + PRELOAD_CACHE_AHEAD".
    const upcoming = playlist.slice(currentTrackIndex + 2, currentTrackIndex + 1 + PRELOAD_CACHE_AHEAD);
    void (async () => {
      for (const track of upcoming) {
        if (!track?.provider_id) continue;
        if (preloadRunIdRef.current !== runId) return; // superseded by a newer call
        await prefetchAudioToCache(
          { ...track, provider: track.provider || 'tidal' },
          streamQuality,
        ).catch(() => {});
      }
    })();
  }, [playbackQuality, streamQuality, qualitiesReady, downloadedTracksRef, buildStreamUrl, streamRetryNonce]);

  return {
    updatePreloadForPlaylist,
    playbackQuality: trackOverrideQuality || playbackQuality,
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
    pendingSeekTrackKeyRef,
    pendingPlayAfterSeekRef,
  };
}
