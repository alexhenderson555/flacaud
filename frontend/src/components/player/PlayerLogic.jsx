import {
  useCallback, useEffect, useMemo, useRef,
} from 'react';
import { useLocation } from 'react-router-dom';
import { showToast } from '../../utils/toast';
import { usePlaybackQuality } from '../../hooks/usePlaybackQuality';
import { usePlayerHotkeys } from '../../hooks/usePlayerHotkeys';
import { useI18n } from '../../hooks/useI18n';
import { usePlayerOverlays } from '../../hooks/usePlayerOverlays';
import { useLibraryLikes } from '../../hooks/useLibraryLikes';
import { usePlayerTransport } from '../../hooks/usePlayerTransport';
import { usePlaybackModes } from '../../hooks/usePlaybackModes';
import {
  setAutoPlaybackQuality as persistAutoQuality,
  setDefaultPlaybackQuality as persistDefaultQuality,
  setStoredPlaybackQuality,
  clampQualityToPlan,
  qualityBadgeLabel,
  shouldNotifyDownloadTierFallback,
} from '../../utils/qualityPrefs';
import { startDownloadJob, notifyDownloadJobStarted } from '../../utils/downloadJobs';
import { downloadCachedTrack, isCacheCompleteForDownload } from '../../utils/cache';
import {
  resolveDownloadQualityForTrack,
  resolvePlayingTrackDownloadQuality,
} from '../../utils/resolveDownloadQuality';
import { readQualityProbeCache } from '../../utils/qualityProbeCache';
import { useAppAuth } from '../../hooks/useAppAuth';
import { buildPlayerOutletContext } from '../../hooks/buildPlayerOutletContext';
import { useDownloadRegistry } from '../../hooks/useDownloadRegistry';
import { usePlayerPersistence } from '../../hooks/usePlayerPersistence';
import { usePlayerMediaEffects } from '../../hooks/usePlayerMediaEffects';
import { useMediaSession } from '../../hooks/useMediaSession';
import { useAudioSlotPair } from '../../hooks/useAudioSlotPair';
import { pauseBackgroundRequests, resumeBackgroundRequests } from '../../utils/authBusy';
import { setPlaybackPriorityState } from '../../utils/playbackPriority';
import { canUseDjFeatures } from '../../utils/djPrefs';
import { clearAudioElementSrc, resolveVolumeUpdate } from '../../utils/playerTransportLogic';
import { normalizeTrack } from '../../utils/trackNormalize';
import { useSetEmbedController } from '../../hooks/useSetEmbedController';

import { usePlayerStore } from '../../store/usePlayerStore';

export default function PlayerLogic({ children }) {
  const location = useLocation();

  const currentTrack = usePlayerStore(s => s.currentTrack);
  const setCurrentTrack = usePlayerStore(s => s.setCurrentTrack);
  const playlist = usePlayerStore(s => s.playlist);
  const setPlaylist = usePlayerStore(s => s.setPlaylist);
  const currentTrackIndex = usePlayerStore(s => s.currentTrackIndex);
  const setCurrentTrackIndex = usePlayerStore(s => s.setCurrentTrackIndex);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setIsPlaying = usePlayerStore(s => s.setIsPlaying);
  const progress = usePlayerStore(s => s.progress);
  const setProgress = usePlayerStore(s => s.setProgress);
  const isLoading = usePlayerStore(s => s.isLoading);
  const setIsLoading = usePlayerStore(s => s.setIsLoading);
  const defaultPlaybackQuality = usePlayerStore(s => s.defaultPlaybackQuality);
  const setDefaultPlaybackQualityState = usePlayerStore(s => s.setDefaultPlaybackQualityState);
  const autoPlaybackQuality = usePlayerStore(s => s.autoPlaybackQuality);
  const setAutoPlaybackQualityState = usePlayerStore(s => s.setAutoPlaybackQualityState);
  const theme = usePlayerStore(s => s.theme);
  const setTheme = usePlayerStore(s => s.setTheme);
  const visualizerEnabled = usePlayerStore(s => s.visualizerEnabled);
  const setVisualizerEnabled = usePlayerStore(s => s.setVisualizerEnabled);
  const lang = usePlayerStore(s => s.lang);
  const setLang = usePlayerStore(s => s.setLang);
  const volume = usePlayerStore(s => s.volume);
  const setVolume = usePlayerStore(s => s.setVolume);

  const pendingPlayRef = useRef(false);
  const playlistRef = useRef(playlist);
  const currentTrackIndexRef = useRef(currentTrackIndex);
  const currentTrackRef = useRef(currentTrack);
  const {
    attachSlotA,
    attachSlotB,
    mainOnSlotA,
    swapAudioSlots,
    getMainAudioEl,
    getPreloadAudioEl,
    audioRef,
    preloadAudioRef,
  } = useAudioSlotPair();
  const crossfadingRef = useRef(false);
  const crossfadeStartedForRef = useRef(null);
  const fadeInPendingRef = useRef(false);
  const skipEndedRef = useRef(false);
  const skipAudioSrcSyncRef = useRef(null);
  const suppressQualityToastsRef = useRef(false);

  const applyVolume = useCallback((next) => {
    setVolume((prev) => {
      const v = resolveVolumeUpdate(prev, next);
      const main = getMainAudioEl?.() ?? audioRef.current;
      const slots = [main, audioRef.current, preloadAudioRef.current].filter(Boolean);
      const unique = [...new Set(slots)];
      if (!fadeInPendingRef.current && !crossfadingRef.current) {
        unique.forEach((el) => { el.volume = v; });
      }
      return v;
    });
  }, [getMainAudioEl, audioRef, preloadAudioRef, fadeInPendingRef, crossfadingRef]);

  const clearPlayerState = useCallback(() => {
    setCurrentTrack(null);
    setPlaylist([]);
    setCurrentTrackIndex(-1);
    setIsPlaying(false);
    setProgress(0);
    [audioRef.current, preloadAudioRef.current].forEach((el) => {
      if (el) clearAudioElementSrc(el);
    });
  }, [audioRef, preloadAudioRef]);

  const hydratePlayerFromStorage = useCallback(() => {
    // validateSession() can finish after the user already started playback.
    if (currentTrackRef.current?.provider_id || pendingPlayRef.current) return;
    try {
      const savedTrack = localStorage.getItem('tidal-current-track');
      const savedPlaylist = localStorage.getItem('tidal-current-playlist');
      const savedIndex = localStorage.getItem('tidal-current-index');
      setCurrentTrack(savedTrack ? normalizeTrack(JSON.parse(savedTrack)) : null);
      setPlaylist(savedPlaylist
        ? JSON.parse(savedPlaylist).map((tr) => normalizeTrack(tr)).filter(Boolean)
        : []);
      setCurrentTrackIndex(savedIndex ? parseInt(savedIndex, 10) : -1);
    } catch (e) {
      console.warn('Could not restore player state', e);
      clearPlayerState();
    }
  }, [clearPlayerState]);

  const {
    sessionReady,
    mediaEnabled,
    authTick,
    effectivePlan,
    djAnalysisEnabled,
    setDjAnalysisEnabled,
  } = useAppAuth({ lang, clearPlayerState, hydratePlayerFromStorage });

  const { downloadedTracks, downloadRegistryTick, downloadedTracksRef, downloadedRegistryRef } = useDownloadRegistry({
    sessionReady,
    mediaEnabled,
  });

  const { t } = useI18n(lang, setLang);
  const overlays = usePlayerOverlays();
  const { likedTracks, toggleLike } = useLibraryLikes(t, {
    enabled: mediaEnabled,
    lang,
  });

  const {
    playbackQuality,
    streamQuality,
    setPlaybackQuality,
    currentAudioSrc,
    setCurrentAudioSrc,
    preloadAudioSrc,
    setPreloadAudioSrc,
    actualQuality,
    deliveredStream,
    availableQualities,
    downloadableQualities,
    probeData,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    restorePendingSeek,
    handleStreamError,
    pendingSeekRef,
    pendingPlayAfterSeekRef,
    updatePreloadForPlaylist,
    deferPlayUntilReady,
  } = usePlaybackQuality({
    skipAudioSrcSyncRef,
    skipEndedRef,
    pendingPlayRef,
    enabled: mediaEnabled,
    currentTrack,
    downloadedTracksRef,
    downloadedRegistryRef,
    downloadRegistryTick,
    effectivePlan,
    autoQuality: autoPlaybackQuality,
    onManualQualityPick: () => {
      if (autoPlaybackQuality) {
        setAutoPlaybackQualityState(false);
        persistAutoQuality(false);
      }
    },
    lang,
    showToast,
    audioRef,
    getMainAudioEl,
    isPlaying,
    setIsLoading,
    setIsPlaying,
    setProgress,
    suppressQualityToastsRef,
  });

  const setDefaultPlaybackQuality = useCallback((q) => {
    const capped = clampQualityToPlan(q, effectivePlan);
    setDefaultPlaybackQualityState(capped);
    persistDefaultQuality(capped);
    if (!autoPlaybackQuality) {
      setStoredPlaybackQuality(capped);
      setPlaybackQuality(capped);
    }
  }, [effectivePlan, autoPlaybackQuality, setPlaybackQuality]);

  const setAutoPlaybackQuality = useCallback((enabled) => {
    setAutoPlaybackQualityState(enabled);
    persistAutoQuality(enabled);
  }, []);

  const runFadeIn = useCallback(() => {
    if (!fadeInPendingRef.current || !audioRef.current) return;
    fadeInPendingRef.current = false;
    crossfadingRef.current = false;
    const el = audioRef.current;
    if (el.paused) {
      el.play().catch(() => {});
    }
    const fadeStart = performance.now();
    el.volume = 0;
    const fade = (now) => {
      const fadeT = Math.min(1, (now - fadeStart) / 800);
      if (audioRef.current) audioRef.current.volume = volume * fadeT;
      if (fadeT < 1) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, [volume]);

  const trackDuration = currentTrack?.duration_s || currentTrack?.duration || 0;
  const playbackModes = usePlaybackModes();

  const pauseMainAudio = useCallback(() => {
    const main = getMainAudioEl?.() ?? audioRef.current;
    if (main) {
      try {
        main.pause();
      } catch {
        /* ignore */
      }
    }
    setIsPlaying(false);
  }, [getMainAudioEl, audioRef, setIsPlaying]);

  const {
    embedUrl,
    embedPlaying,
    embedEngaged,
    embedTitle,
    registerSetEmbedAnchor,
    loadSetEmbed,
    playSetEmbed,
    pauseSetEmbed,
    releaseSetEmbed,
    resumeSetEmbed,
    toggleSetEmbed,
    seekSetEmbed,
    seekSetAudioPreview,
    seekSetAudioCommit,
    handleEmbedReady,
    handleEmbedPlay,
    handleEmbedPause,
    handleSetAudioReady,
    handleSetAudioTimeUpdate,
    handleSetAudioLoadedMetadata,
    setAudioMode,
    setAudioRef,
    setAudioProgress,
    setAudioDuration,
    setAudioSrc,
    playerRef: setEmbedPlayerRef,
    anchorEl: setEmbedAnchorEl,
  } = useSetEmbedController({
    pauseMainAudio,
    setMainPlaying: setIsPlaying,
    volume,
  });

  const transport = usePlayerTransport({
    audioRef,
    preloadAudioRef,
    volume,
    lang,
    t,
    trackDuration,
    isPlaying,
    setIsPlaying,
    setIsLoading,
    setProgress,
    currentTrack,
    setCurrentTrack,
    playlist,
    setPlaylist,
    currentTrackIndex,
    setCurrentTrackIndex,
    preloadAudioSrc,
    playlistRef,
    currentTrackIndexRef,
    currentTrackRef,
    pendingPlayRef,
    crossfadingRef,
    crossfadeStartedForRef,
    fadeInPendingRef,
    skipEndedRef,
    skipAudioSrcSyncRef,
    pendingSeekRef,
    pendingPlayAfterSeekRef,
    runFadeIn,
    modesRef: playbackModes.modesRef,
    shuffleEnabled: playbackModes.shuffleEnabled,
    repeatMode: playbackModes.repeatMode,
    setCurrentAudioSrc,
    setPreloadAudioSrc,
    swapAudioSlots,
    getMainAudioEl,
    getPreloadAudioEl,
    deferPlayUntilReady,
    pauseSetEmbed,
    releaseSetEmbed,
    suppressQualityToastsRef,
  });

  usePlayerPersistence({
    mediaEnabled,
    playlist,
    currentTrackIndex,
    setCurrentTrackIndex,
    setCurrentTrack,
    currentTrack,
    playlistRef,
    currentTrackIndexRef,
    currentTrackRef,
  });

  const djFeaturesActive = canUseDjFeatures(effectivePlan, djAnalysisEnabled);

  usePlayerMediaEffects({
    mediaEnabled,
    theme,
    visualizerEnabled,
    volume,
    audioRef,
    getMainAudioEl,
    fadeInPendingRef,
    crossfadingRef,
    currentTrack,
    setCurrentTrack,
    playlist,
    currentTrackIndex,
    currentAudioSrc,
    playbackQuality,
    preloadAudioRef,
    preloadAudioSrc,
    updatePreloadForPlaylist,
    overlays,
    djFeaturesActive,
    isPlaying,
  });

  useMediaSession({
    enabled: mediaEnabled,
    currentTrack,
    isPlaying,
    isLoading,
    audioRef,
    playNext: transport.playNext,
    playPrevious: transport.playPrevious,
  });

  useEffect(() => {
    const onAccount = location.pathname === '/account';
    if (onAccount && !mediaEnabled) {
      pauseBackgroundRequests();
      return () => resumeBackgroundRequests();
    }
    return undefined;
  }, [location.pathname, mediaEnabled]);

  const handleDownload = useCallback(async (track, e, options = {}) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!track) return;
    try {
      const fromPlayer = options.fromPlayer === true;
      const isCurrentTrack = currentTrack
        && String(track.provider_id) === String(currentTrack.provider_id);
      const probeData = track.provider_id
        ? readQualityProbeCache(track.provider || 'tidal', String(track.provider_id))
        : null;
      const quality = fromPlayer && isCurrentTrack
        ? resolvePlayingTrackDownloadQuality({
          streamQuality,
          playbackQuality,
          probeData,
          catalogQuality: track.quality,
          availableQualities,
          downloadableQualities,
          qualitiesReady,
          effectivePlan,
        })
        : await resolveDownloadQualityForTrack(track, {
          autoPlaybackQuality,
          defaultPlaybackQuality,
          effectivePlan,
          lang,
        });
      const cached = await isCacheCompleteForDownload(track, quality);
      if (cached) {
        const saved = await downloadCachedTrack(track, quality);
        if (saved) showToast(t('quickCacheSave'));
      }
      const url = track.source_url || `https://tidal.com/track/${track.provider_id}`;
      const isPlayingCurrent = isCurrentTrack && isPlaying;
      const optimisticId = `opt-${String(track.provider_id)}-${Date.now()}`;
      notifyDownloadJobStarted(optimisticId, { title: track.title, quality });
      await startDownloadJob({
        url,
        quality,
        track,
        optimisticId,
        prefetch: !isPlayingCurrent,
      });
      if (!cached) {
        const streamTier = fromPlayer && isCurrentTrack && qualitiesReady ? streamQuality : null;
        if (shouldNotifyDownloadTierFallback(streamTier, quality)) {
          const asked = qualityBadgeLabel(streamTier);
          const got = qualityBadgeLabel(quality);
          showToast(
            lang === 'ru'
              ? `${asked} недоступен для скачивания — загружаем ${got}`
              : `${asked} not available for download — fetching ${got}`,
          );
        }
      }
    } catch (err) {
      console.error(err);
      showToast(t('downloadFailed'));
    }
  }, [
    autoPlaybackQuality,
    defaultPlaybackQuality,
    effectivePlan,
    lang,
    t,
    currentTrack,
    isPlaying,
    streamQuality,
    playbackQuality,
    availableQualities,
    downloadableQualities,
    qualitiesReady,
  ]);

  const currentTrackId = currentTrack ? String(currentTrack.provider_id) : null;
  const playingTrackId = isPlaying && currentTrack ? String(currentTrack.provider_id) : null;

  useEffect(() => {
    setPlaybackPriorityState({
      loading: isLoading,
      playing: isPlaying,
      currentTrackId,
    });
  }, [isLoading, isPlaying, currentTrackId]);

  const playerContext = useMemo(
    () => buildPlayerOutletContext({
      transport,
      currentTrackId,
      playingTrackId,
      isPlaying,
      isLoading,
      likedTracks,
      toggleLike,
      handleDownload,
      playbackQuality,
      setPlaybackQuality,
      defaultPlaybackQuality,
      setDefaultPlaybackQuality,
      autoPlaybackQuality,
      setAutoPlaybackQuality,
      theme,
      setTheme,
      audioRef,
      visualizerEnabled,
      setVisualizerEnabled,
      lang,
      setLang,
      t,
      downloadedTracks,
      playlist,
      effectivePlan,
      djAnalysisEnabled,
      setDjAnalysisEnabled,
    }),
    [
      transport,
      currentTrackId,
      playingTrackId,
      isPlaying,
      isLoading,
      likedTracks,
      toggleLike,
      handleDownload,
      playbackQuality,
      setPlaybackQuality,
      defaultPlaybackQuality,
      setDefaultPlaybackQuality,
      autoPlaybackQuality,
      setAutoPlaybackQuality,
      theme,
      visualizerEnabled,
      lang,
      t,
      downloadedTracks,
      playlist,
      effectivePlan,
      djAnalysisEnabled,
      setDjAnalysisEnabled,
    ],
  );

  usePlayerHotkeys({
    enabled: mediaEnabled,
    currentTrack,
    isPlaying,
    audioRef,
    getMainAudioEl,
    playNext: transport.playNext,
    playPrevious: transport.playPrevious,
    toggleOverlay: overlays.toggleOverlay,
    closeAllPanels: overlays.closeAllPanels,
    setVolume: applyVolume,
    setIsCommandPaletteOpen: overlays.setIsCommandPaletteOpen,
    toggleShuffle: playbackModes.toggleShuffle,
    cycleRepeat: playbackModes.cycleRepeat,
    toggleLike,
    startTrackRadio: transport.startTrackRadio,
    pauseSetEmbed,
    embedEngaged,
    toggleSetEmbed,
  });

  const shellValue = useMemo(() => ({
    sessionReady,
    authTick,
    mediaEnabled,
    effectivePlan,
    lang,
    t,
    overlays,
    transport,
    playerContext,
    audioRef,
    getMainAudioEl,
    isPlaying,
    likedTracks,
    toggleLike,
    handleDownload,
    playbackQuality,
    availableQualities,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    shuffleEnabled: playbackModes.shuffleEnabled,
    repeatMode: playbackModes.repeatMode,
    toggleShuffle: playbackModes.toggleShuffle,
    cycleRepeat: playbackModes.cycleRepeat,
    visualizerEnabled,
    setVisualizerEnabled,
    getMainAudioEl,
    theme,
    setTheme,
    embedUrl,
    embedPlaying,
    embedEngaged,
    embedTitle,
    registerSetEmbedAnchor,
    loadSetEmbed,
    playSetEmbed,
    pauseSetEmbed,
    releaseSetEmbed,
    resumeSetEmbed,
    toggleSetEmbed,
    seekSetEmbed,
    seekSetAudioPreview,
    seekSetAudioCommit,
    handleEmbedReady,
    handleEmbedPlay,
    handleEmbedPause,
    handleSetAudioReady,
    handleSetAudioTimeUpdate,
    handleSetAudioLoadedMetadata,
    setAudioMode,
    setAudioRef,
    setAudioProgress,
    setAudioDuration,
    setAudioSrc,
    setEmbedPlayerRef,
    anchorEl: setEmbedAnchorEl,
  }), [
    sessionReady,
    authTick,
    mediaEnabled,
    effectivePlan,
    lang,
    t,
    overlays,
    transport,
    playerContext,
    audioRef,
    getMainAudioEl,
    isPlaying,
    likedTracks,
    toggleLike,
    handleDownload,
    playbackQuality,
    availableQualities,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    playbackModes.shuffleEnabled,
    playbackModes.repeatMode,
    playbackModes.toggleShuffle,
    playbackModes.cycleRepeat,
    visualizerEnabled,
    theme,
    embedUrl,
    embedPlaying,
    embedEngaged,
    embedTitle,
    registerSetEmbedAnchor,
    loadSetEmbed,
    playSetEmbed,
    pauseSetEmbed,
    releaseSetEmbed,
    resumeSetEmbed,
    toggleSetEmbed,
    seekSetEmbed,
    seekSetAudioPreview,
    seekSetAudioCommit,
    handleEmbedReady,
    handleEmbedPlay,
    handleEmbedPause,
    handleSetAudioReady,
    handleSetAudioTimeUpdate,
    handleSetAudioLoadedMetadata,
    setAudioMode,
    setAudioRef,
    setAudioProgress,
    setAudioDuration,
    setAudioSrc,
    setEmbedPlayerRef,
    setEmbedAnchorEl,
  ]);

  const playbackValue = useMemo(() => ({
    currentTrack,
    playlist,
    currentTrackIndex,
    isPlaying,
    isLoading,
    progress,
    trackDuration,
    attachSlotA,
    attachSlotB,
    mainOnSlotA,
    getMainAudioEl,
    audioRef,
    preloadAudioRef,
    currentAudioSrc,
    preloadAudioSrc,
    volume,
    setVolume: applyVolume,
    setIsPlaying,
    setIsLoading,
    setProgress,
    restorePendingSeek,
    runFadeIn,
    fadeInPendingRef,
    pendingPlayRef,
    pendingSeekRef,
    skipEndedRef,
    crossfadingRef,
    handleStreamError,
    actualQuality,
    deliveredStream,
    playbackQuality,
    streamQuality,
    availableQualities,
    probeData,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    deferPlayUntilReady,
  }), [
    currentTrack,
    playlist,
    currentTrackIndex,
    isPlaying,
    isLoading,
    progress,
    trackDuration,
    attachSlotA,
    attachSlotB,
    mainOnSlotA,
    getMainAudioEl,
    currentAudioSrc,
    preloadAudioSrc,
    volume,
    applyVolume,
    restorePendingSeek,
    runFadeIn,
    handleStreamError,
    actualQuality,
    deliveredStream,
    playbackQuality,
    streamQuality,
    availableQualities,
    probeData,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    deferPlayUntilReady,
  ]);

  useEffect(() => {
    usePlayerStore.setState({ ...shellValue, ...playbackValue });
  }, [shellValue, playbackValue]);

  const isInitialized = useRef(false);
  if (!isInitialized.current) {
    usePlayerStore.setState({ ...shellValue, ...playbackValue });
    isInitialized.current = true;
  }

  return children;
}
