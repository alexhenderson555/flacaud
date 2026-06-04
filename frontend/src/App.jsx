import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { showToast } from './utils/toast';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AudioVisualizer from './components/AudioVisualizer';
import PlayerBar from './components/PlayerBar';
import Titlebar from './components/Titlebar';
import DownloadToast from './components/DownloadToast';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import HotkeyHint from './components/HotkeyHint';
import AppSidebar from './components/layout/AppSidebar';
import GlobalAudio from './components/player/GlobalAudio';
import PlayerOverlays from './components/player/PlayerOverlays';
import { usePlaybackQuality } from './hooks/usePlaybackQuality';
import { usePlayerHotkeys } from './hooks/usePlayerHotkeys';
import { useI18n } from './hooks/useI18n';
import { usePlayerOverlays } from './hooks/usePlayerOverlays';
import { useLibraryLikes } from './hooks/useLibraryLikes';
import { usePlayerTransport } from './hooks/usePlayerTransport';
import { getDefaultPlaybackQuality, setDefaultPlaybackQuality as persistDefaultQuality } from './utils/qualityPrefs';
import { startDownloadJob } from './utils/downloadJobs';
import { FastAverageColor } from 'fast-average-color';
import { isTrackCached, downloadCachedTrack } from './utils/cache';
import { prefetchLyrics } from './utils/lyrics';
import { analyzeTrackFeatures } from './utils/trackFeatures';
import { serializeTrackForStorage, tracksMatch } from './utils/trackNormalize';
import { validateSession, clearSession, getStoredEffectivePlan } from './utils/authSession';
import { clampQualityToPlan } from './utils/qualityPrefs';
import { isBackgroundPaused, pauseBackgroundRequests, resumeBackgroundRequests } from './utils/authBusy';
import { debounce, runWhenIdle, setsEqual } from './utils/debounce';

function App() {
  const location = useLocation();
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultPlaybackQuality, setDefaultPlaybackQualityState] = useState(() => getDefaultPlaybackQuality());
  const [theme, setTheme] = useState(localStorage.getItem('tidal-theme') || 'default');
  const [visualizerEnabled, setVisualizerEnabled] = useState(localStorage.getItem('tidal-vis') === 'true');
  const [lang, setLang] = useState(localStorage.getItem('tidal-lang') || 'en');
  const [downloadedTracks, setDownloadedTracks] = useState(new Set());
  const [downloadRegistryTick, setDownloadRegistryTick] = useState(0);
  const [sessionReady, setSessionReady] = useState(() => !localStorage.getItem('tidal-token'));
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [authTick, setAuthTick] = useState(0);
  const [effectivePlan, setEffectivePlan] = useState(() => getStoredEffectivePlan());

  const pendingPlayRef = useRef(false);
  const playlistRef = useRef(playlist);
  const currentTrackIndexRef = useRef(currentTrackIndex);
  const currentTrackRef = useRef(currentTrack);
  const downloadedTracksRef = useRef(new Set());
  const audioRef = useRef(null);
  const preloadAudioRef = useRef(null);
  const crossfadingRef = useRef(false);
  const crossfadeStartedForRef = useRef(null);
  const fadeInPendingRef = useRef(false);
  const skipEndedRef = useRef(false);
  const progressRef = useRef(null);
  const timeSpanRef = useRef(null);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tidal-volume');
    return saved ? parseFloat(saved) : 1.0;
  });

  const clearPlayerState = useCallback(() => {
    setCurrentTrack(null);
    setPlaylist([]);
    setCurrentTrackIndex(-1);
    setIsPlaying(false);
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  }, []);

  const hydratePlayerFromStorage = useCallback(() => {
    try {
      const savedTrack = localStorage.getItem('tidal-current-track');
      const savedPlaylist = localStorage.getItem('tidal-current-playlist');
      const savedIndex = localStorage.getItem('tidal-current-index');
      setCurrentTrack(savedTrack ? JSON.parse(savedTrack) : null);
      setPlaylist(savedPlaylist ? JSON.parse(savedPlaylist) : []);
      setCurrentTrackIndex(savedIndex ? parseInt(savedIndex, 10) : -1);
    } catch (e) {
      console.warn('Could not restore player state', e);
      clearPlayerState();
    }
  }, [clearPlayerState]);

  const { t } = useI18n(lang, setLang);
  const overlays = usePlayerOverlays();
  const { likedTracks, libraryRevision, setLibraryRevision, toggleLike } = useLibraryLikes(t, { enabled: mediaEnabled });

  const {
    playbackQuality,
    setPlaybackQuality,
    currentAudioSrc,
    preloadAudioSrc,
    actualQuality,
    availableQualities,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    restorePendingSeek,
    handleStreamError,
    pendingSeekRef,
    updatePreloadForPlaylist,
  } = usePlaybackQuality({
    enabled: mediaEnabled,
    currentTrack,
    downloadedTracksRef,
    downloadRegistryTick,
    effectivePlan,
    lang,
    showToast,
    audioRef,
    isPlaying,
    setIsLoading,
    setIsPlaying,
    setProgress,
  });

  const setDefaultPlaybackQuality = useCallback((q) => {
    const capped = clampQualityToPlan(q, effectivePlan);
    setDefaultPlaybackQualityState(capped);
    persistDefaultQuality(capped);
  }, [effectivePlan]);

  const runFadeIn = useCallback(() => {
    if (!fadeInPendingRef.current || !audioRef.current) return;
    fadeInPendingRef.current = false;
    crossfadingRef.current = false;
    const fadeStart = performance.now();
    audioRef.current.volume = 0;
    const fade = (now) => {
      const fadeT = Math.min(1, (now - fadeStart) / 800);
      if (audioRef.current) audioRef.current.volume = volume * fadeT;
      if (fadeT < 1) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, [volume]);

  const trackDuration = currentTrack?.duration_s || currentTrack?.duration || 0;

  const transport = usePlayerTransport({
    audioRef,
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
    progressRef,
    timeSpanRef,
    runFadeIn,
  });

  useEffect(() => {
    const bump = () => setAuthTick((n) => n + 1);
    const onAuthExpired = (e) => {
      showToast(e.detail?.message || (lang === 'ru' ? 'Сессия истекла' : 'Session expired'));
      setMediaEnabled(false);
      clearPlayerState();
      bump();
    };
    const onLogin = () => {
      setMediaEnabled(true);
      hydratePlayerFromStorage();
      bump();
    };
    const onPlan = (e) => setEffectivePlan(e.detail?.plan || getStoredEffectivePlan());
    window.addEventListener('tidal-auth-expired', onAuthExpired);
    window.addEventListener('tidal-auth-login', onLogin);
    window.addEventListener('tidal-plan-update', onPlan);
    return () => {
      window.removeEventListener('tidal-auth-expired', onAuthExpired);
      window.removeEventListener('tidal-auth-login', onLogin);
      window.removeEventListener('tidal-plan-update', onPlan);
    };
  }, [lang, clearPlayerState, hydratePlayerFromStorage]);

  useEffect(() => {
    setEffectivePlan(getStoredEffectivePlan());
  }, [authTick]);

  useEffect(() => {
    const token = localStorage.getItem('tidal-token');
    if (!token) {
      setMediaEnabled(false);
      clearPlayerState();
      setSessionReady(true);
      return undefined;
    }
    let cancelled = false;
    validateSession()
      .then((ok) => {
        if (cancelled) return;
        if (!ok) {
          clearSession();
          setMediaEnabled(false);
          clearPlayerState();
          setAuthTick((n) => n + 1);
          return;
        }
        setMediaEnabled(true);
        hydratePlayerFromStorage();
      })
      .catch(() => {
        if (!cancelled) {
          setMediaEnabled(false);
          clearPlayerState();
        }
      })
      .finally(() => {
        if (!cancelled) setSessionReady(true);
      });
    return () => { cancelled = true; };
  }, [authTick, clearPlayerState, hydratePlayerFromStorage]);

  useEffect(() => {
    let lastRecheck = 0;
    const RECHECK_MIN_MS = 120_000;
    const recheck = () => {
      if (!localStorage.getItem('tidal-token')) return;
      const now = Date.now();
      if (now - lastRecheck < RECHECK_MIN_MS) return;
      lastRecheck = now;
      validateSession()
        .then((ok) => {
          if (!ok) {
            clearSession();
            setAuthTick((n) => n + 1);
            showToast(lang === 'ru' ? 'Сессия истекла — войдите снова' : 'Session expired — please log in again');
          }
        })
        .catch(() => { /* ignore transient offline */ });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lang]);

  useEffect(() => {
    if (!sessionReady || !mediaEnabled) return undefined;
    const REGISTRY_MS = 60_000;
    let registryBusy = false;
    const fetchDownloads = async () => {
      if (registryBusy) return;
      if (!localStorage.getItem('tidal-token')) return;
      if (document.visibilityState === 'hidden' || isBackgroundPaused()) return;
      registryBusy = true;
      try {
        const res = await fetch('/api/downloads');
        if (res.ok) {
          const data = await res.json();
          const newSet = new Set(Object.keys(data));
          if (!setsEqual(newSet, downloadedTracksRef.current)) {
            downloadedTracksRef.current = newSet;
            setDownloadedTracks(newSet);
            setDownloadRegistryTick((n) => n + 1);
          }
        }
      } catch {
        /* ignore */
      } finally {
        registryBusy = false;
      }
    };
    fetchDownloads();
    const iv = setInterval(fetchDownloads, REGISTRY_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchDownloads();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [sessionReady, mediaEnabled]);

  useEffect(() => {
    const onAccount = location.pathname === '/account';
    if (onAccount && !mediaEnabled) {
      pauseBackgroundRequests();
      return () => resumeBackgroundRequests();
    }
    return undefined;
  }, [location.pathname, mediaEnabled]);

  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  useEffect(() => {
    if (!mediaEnabled) return;
    try {
      const slim = serializeTrackForStorage(currentTrack);
      if (slim) localStorage.setItem('tidal-current-track', JSON.stringify(slim));
      else localStorage.removeItem('tidal-current-track');
    } catch (e) {
      console.warn('Could not persist current track', e);
    }
  }, [currentTrack, mediaEnabled]);

  const persistPlaylist = useMemo(
    () => debounce((pl, idx) => {
      try {
        const slimPlaylist = (pl || []).map(serializeTrackForStorage).filter(Boolean);
        localStorage.setItem('tidal-current-playlist', JSON.stringify(slimPlaylist));
        localStorage.setItem('tidal-current-index', String(idx));
      } catch (e) {
        console.warn('Could not persist playlist', e);
      }
    }, 400),
    [],
  );
  useEffect(() => {
    if (!mediaEnabled) return;
    persistPlaylist(playlist, currentTrackIndex);
  }, [playlist, currentTrackIndex, persistPlaylist, mediaEnabled]);

  useEffect(() => {
    if (!currentTrack || !playlist?.length) return;
    const idx = playlist.findIndex((tr) => tracksMatch(tr, currentTrack));
    if (idx !== -1 && idx !== currentTrackIndex) setCurrentTrackIndex(idx);
  }, [currentTrack, playlist, currentTrackIndex]);

  useEffect(() => {
    localStorage.setItem('tidal-volume', volume.toString());
    if (audioRef.current && !fadeInPendingRef.current && !crossfadingRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tidal-theme', theme);
    document.documentElement.style.removeProperty('--accent-glow');
    document.documentElement.style.removeProperty('--accent-gradient');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('tidal-vis', String(visualizerEnabled));
  }, [visualizerEnabled]);

  useEffect(() => {
    if (!mediaEnabled) return;
    updatePreloadForPlaylist(playlist, currentTrackIndex);
  }, [mediaEnabled, playlist, currentTrackIndex, playbackQuality, updatePreloadForPlaylist]);

  useEffect(() => {
    if (!mediaEnabled) return;
    if (document.visibilityState === 'hidden') return;
    if (overlays.isLyricsOpen || overlays.isKaraokeOpen) {
      if (currentTrack) prefetchLyrics(currentTrack);
    }
    if (
      (overlays.isLyricsOpen || overlays.isKaraokeOpen)
      && playlist?.length
      && currentTrackIndex >= 0
      && currentTrackIndex < playlist.length - 1
    ) {
      prefetchLyrics(playlist[currentTrackIndex + 1]);
    }
  }, [mediaEnabled, currentTrack, playlist, currentTrackIndex, overlays.isLyricsOpen, overlays.isKaraokeOpen]);

  const trackPrefetchKey = currentTrack?.provider_id
    ? `${currentTrack.provider_id}:${currentAudioSrc}:${playbackQuality}`
    : '';

  useEffect(() => {
    if (!mediaEnabled) return;
    if (!currentTrack?.provider_id || !currentAudioSrc || document.visibilityState === 'hidden') return;
    if (!overlays.isDJOpen) return;
    const track = currentTrack;
    const src = currentAudioSrc;
    runWhenIdle(() => {
      analyzeTrackFeatures(track, src).catch(() => {});
    });
  }, [mediaEnabled, trackPrefetchKey, currentTrack, currentAudioSrc, overlays.isDJOpen]);

  useEffect(() => {
    if (!mediaEnabled) return undefined;
    if (!currentTrack?.provider_id || currentTrack.cover_url) return undefined;
    let cancelled = false;
    const provider = currentTrack.provider || 'tidal';
    fetch(`/api/track/${provider}/${currentTrack.provider_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (cancelled || !meta?.cover_url) return;
        setCurrentTrack((prev) => (prev ? { ...prev, cover_url: meta.cover_url, duration_s: prev.duration_s ?? meta.duration_s } : prev));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrack?.provider_id, currentTrack?.provider]);

  useEffect(() => {
    if (!mediaEnabled || !currentTrack) return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artists ? currentTrack.artists.join(', ') : 'Unknown Artist',
        album: currentTrack.album || '',
        artwork: [{ src: currentTrack.cover_url || 'https://via.placeholder.com/512', sizes: '512x512', type: 'image/jpeg' }],
      });
      navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    }
    if (currentTrack.cover_url) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = `/api/image-proxy?url=${encodeURIComponent(currentTrack.cover_url)}`;
      img.onload = () => {
        try {
          const color = new FastAverageColor().getColor(img);
          if (color) {
            const rgb = `${color.value[0]}, ${color.value[1]}, ${color.value[2]}`;
            document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb}, 0.15)`);
            document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, rgba(${rgb}, 0.8), rgba(${rgb}, 0.2))`);
            document.documentElement.style.setProperty('--accent-solid', `rgb(${rgb})`);
          }
        } catch (e) {
          console.error('FastAverageColor error', e);
        }
      };
    }
  }, [mediaEnabled, currentTrack]);

  const handleDownload = useCallback(async (track, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!track) return;
    try {
      const cached = await isTrackCached(track, playbackQuality);
      if (cached) {
        const saved = await downloadCachedTrack(track, playbackQuality);
        if (saved) showToast(t('quickCacheSave'));
      }
      const url = track.source_url || `https://tidal.com/track/${track.provider_id}`;
      await startDownloadJob({ url, quality: playbackQuality });
      if (!cached) showToast(t('downloadStarted'));
    } catch (err) {
      console.error(err);
      showToast(t('downloadFailed'));
    }
  }, [playbackQuality, t]);

  const currentTrackId = currentTrack ? String(currentTrack.provider_id) : null;
  const playingTrackId = isPlaying && currentTrack ? String(currentTrack.provider_id) : null;

  const playerContext = useMemo(() => ({
    togglePlay: transport.togglePlay,
    currentTrackId,
    playingTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    libraryRevision,
    playbackQuality,
    setPlaybackQuality,
    defaultPlaybackQuality,
    setDefaultPlaybackQuality,
    theme,
    setTheme,
    progress,
    audioRef,
    visualizerEnabled,
    setVisualizerEnabled,
    lang,
    setLang,
    t,
    downloadedTracks,
    startTrackRadio: transport.startTrackRadio,
  }), [
    transport.togglePlay,
    transport.startTrackRadio,
    currentTrackId,
    playingTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    libraryRevision,
    playbackQuality,
    setPlaybackQuality,
    defaultPlaybackQuality,
    setDefaultPlaybackQuality,
    theme,
    progress,
    visualizerEnabled,
    lang,
    t,
    downloadedTracks,
  ]);

  usePlayerHotkeys({
    enabled: mediaEnabled,
    currentTrack,
    isPlaying,
    audioRef,
    playNext: transport.playNext,
    playPrevious: transport.playPrevious,
    toggleOverlay: overlays.toggleOverlay,
    closeAllPanels: overlays.closeAllPanels,
    setVolume,
    setIsCommandPaletteOpen: overlays.setIsCommandPaletteOpen,
  });

  if (!sessionReady) {
    return (
      <div className="app-container" style={{ paddingTop: window.__TAURI__ ? '38px' : '0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{lang === 'ru' ? 'Загрузка…' : 'Loading…'}</div>
      </div>
    );
  }

  const hasToken = !!localStorage.getItem('tidal-token');
  void authTick;

  if (!hasToken && location.pathname !== '/account') {
    return <Navigate to="/account" replace />;
  }

  return (
    <div className="app-container" style={{ paddingTop: window.__TAURI__ ? '38px' : '0' }}>
      <Titlebar />
      {mediaEnabled && visualizerEnabled ? (
        <AudioVisualizer audioRef={audioRef} isPlaying={isPlaying} />
      ) : (
        <>
          <div className="ambient-glow glow-1" />
          <div className="ambient-glow glow-2" />
          <div className="ambient-glow glow-3" />
        </>
      )}

      <AppSidebar t={t} isMobileMenuOpen={overlays.isMobileMenuOpen} setIsMobileMenuOpen={overlays.setIsMobileMenuOpen} />

      <main className="main-content">
        <div className="page-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{ minHeight: '100%' }}
            >
              <Outlet context={playerContext} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {mediaEnabled && (
        <>
          <GlobalAudio
            audioRef={audioRef}
            preloadAudioRef={preloadAudioRef}
            currentAudioSrc={currentAudioSrc}
            preloadAudioSrc={preloadAudioSrc}
            setIsPlaying={setIsPlaying}
            setIsLoading={setIsLoading}
            playNext={transport.playNext}
            restorePendingSeek={restorePendingSeek}
            runFadeIn={runFadeIn}
            fadeInPendingRef={fadeInPendingRef}
            pendingPlayRef={pendingPlayRef}
            pendingSeekRef={pendingSeekRef}
            skipEndedRef={skipEndedRef}
            volume={volume}
            handleStreamError={handleStreamError}
            t={t}
          />

          <PlayerOverlays
            isKaraokeOpen={overlays.isKaraokeOpen}
            isDJOpen={overlays.isDJOpen}
            isQueueOpen={overlays.isQueueOpen}
            isEQOpen={overlays.isEQOpen}
            isLyricsOpen={overlays.isLyricsOpen}
            isPlaylistModalOpenPlayer={overlays.isPlaylistModalOpenPlayer}
            setIsKaraokeOpen={overlays.setIsKaraokeOpen}
            setIsDJOpen={overlays.setIsDJOpen}
            setIsQueueOpen={overlays.setIsQueueOpen}
            setIsEQOpen={overlays.setIsEQOpen}
            setIsLyricsOpen={overlays.setIsLyricsOpen}
            setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
            currentTrack={currentTrack}
            audioRef={audioRef}
            playlist={playlist}
            currentTrackIndex={currentTrackIndex}
            handleReorderQueue={transport.handleReorderQueue}
            togglePlay={transport.togglePlay}
            setLibraryRevision={setLibraryRevision}
          />

          <PlayerBar
            t={t}
            currentTrack={currentTrack}
            actualQuality={actualQuality}
            isLoading={isLoading}
            isPlaying={isPlaying}
            progress={progress}
            trackDuration={trackDuration}
            volume={volume}
            playbackQuality={playbackQuality}
            effectivePlan={effectivePlan}
            availableQualities={availableQualities}
            qualitiesReady={qualitiesReady}
            maxTrackQuality={maxTrackQuality}
            likedTracks={likedTracks}
            isKaraokeOpen={overlays.isKaraokeOpen}
            isDJOpen={overlays.isDJOpen}
            isEQOpen={overlays.isEQOpen}
            isQueueOpen={overlays.isQueueOpen}
            playlist={playlist}
            currentTrackIndex={currentTrackIndex}
            togglePlay={transport.togglePlay}
            playPrevious={transport.playPrevious}
            playNext={transport.playNext}
            handleSeek={transport.handleSeek}
            changeQuality={changeQuality}
            toggleLike={toggleLike}
            setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
            handleDownloadPlayer={() => currentTrack && handleDownload(currentTrack)}
            toggleOverlay={overlays.toggleOverlay}
            setVolume={setVolume}
            timeSpanRef={timeSpanRef}
            progressRef={progressRef}
            nextTrack={transport.nextTrack}
            startTrackRadio={transport.startTrackRadio}
          />

          <HotkeyHint lang={lang} />
          <DownloadToast />
          <CommandPalette
            isOpen={overlays.isCommandPaletteOpen}
            onClose={() => overlays.setIsCommandPaletteOpen(false)}
            lang={lang}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              if (!currentTrack) return;
              if (isPlaying) audioRef.current?.pause();
              else audioRef.current?.play();
            }}
            onToggleQueue={() => overlays.toggleOverlay('queue')}
            onToggleLyrics={() => overlays.toggleOverlay('lyrics')}
            onToggleEq={() => overlays.toggleOverlay('eq')}
            onToggleDj={() => overlays.toggleOverlay('dj')}
            onToggleKaraoke={() => overlays.toggleOverlay('karaoke')}
            onPlayTrack={transport.togglePlay}
          />
        </>
      )}

      <ToastContainer />
    </div>
  );
}

export default App;
