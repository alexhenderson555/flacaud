import { useCallback, useEffect, useRef, useState } from 'react';
import { canPlaySetUrl } from '../components/LazySetPlayer';
import { deriveSetTitle, normalizeSetUrl } from '../utils/setLibrary';
import { cachedSetAudioUrl, probeCachedSetAudio } from '../utils/setCachedAudio';
import { seekSetPlayer, seekSetPlayerWithRetry } from '../utils/setPlayerSeek';

/**
 * Global DJ-set playback (YouTube / SoundCloud embed, or cached MP3 after analyze_set).
 * Mutually exclusive with the main Tidal <audio> player.
 *
 * embedEngaged — user opened a set session (dock / PlayerBar stay available while paused).
 * setAudioMode — analyzed set MP3 from server cache (seek bar + timestamp sync).
 */
export function useSetEmbedController({ pauseMainAudio, setMainPlaying, volume = 1 }) {
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedPlaying, setEmbedPlaying] = useState(false);
  const [embedEngaged, setEmbedEngaged] = useState(false);
  const [embedDisplayTitle, setEmbedDisplayTitle] = useState('');
  const [setAudioMode, setSetAudioMode] = useState(false);
  const [setAudioProgress, setSetAudioProgress] = useState(0);
  const [setAudioDuration, setSetAudioDuration] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const playerRef = useRef(null);
  const setAudioRef = useRef(null);
  const suppressEmbedSyncRef = useRef(false);
  const pendingSeekRef = useRef(null);
  const seekRetryCleanupRef = useRef(null);
  const setAudioModeRef = useRef(false);

  useEffect(() => {
    setAudioModeRef.current = setAudioMode;
  }, [setAudioMode]);

  const registerSetEmbedAnchor = useCallback((el) => {
    setAnchorEl(el || null);
  }, []);

  const applyPendingSeekToEmbed = useCallback(() => {
    const pending = pendingSeekRef.current;
    if (pending == null) return false;
    if (seekSetPlayer(playerRef.current, pending)) {
      pendingSeekRef.current = null;
      seekRetryCleanupRef.current?.();
      seekRetryCleanupRef.current = null;
      return true;
    }
    return false;
  }, []);

  const applyPendingSeekToAudio = useCallback(() => {
    const pending = pendingSeekRef.current;
    const el = setAudioRef.current;
    if (pending == null || !el) return false;
    try {
      el.currentTime = pending;
      setSetAudioProgress(pending);
      pendingSeekRef.current = null;
      return true;
    } catch {
      return false;
    }
  }, []);

  const pauseSetEmbed = useCallback((opts = {}) => {
    suppressEmbedSyncRef.current = true;
    if (setAudioModeRef.current) {
      setAudioRef.current?.pause?.();
    } else {
      playerRef.current?.pause?.();
    }
    setEmbedPlaying(false);
    const ms = opts.suppressMs ?? 800;
    window.setTimeout(() => {
      suppressEmbedSyncRef.current = false;
    }, ms);
  }, []);

  const releaseSetEmbed = useCallback(() => {
    seekRetryCleanupRef.current?.();
    seekRetryCleanupRef.current = null;
    pendingSeekRef.current = null;
    suppressEmbedSyncRef.current = true;
    setAudioRef.current?.pause?.();
    playerRef.current?.pause?.();
    setEmbedPlaying(false);
    setEmbedEngaged(false);
    setSetAudioMode(false);
    setSetAudioProgress(0);
    setSetAudioDuration(0);
    setEmbedUrl('');
    setEmbedDisplayTitle('');
    window.setTimeout(() => {
      suppressEmbedSyncRef.current = false;
    }, 800);
  }, []);

  const loadSetEmbed = useCallback((url) => {
    const trimmed = normalizeSetUrl(url);
    if (!trimmed || !canPlaySetUrl(trimmed)) return false;
    setEmbedUrl(trimmed);
    return true;
  }, []);

  const handleEmbedReady = useCallback(() => {
    if (setAudioModeRef.current) return;
    if (applyPendingSeekToEmbed()) {
      setEmbedPlaying(true);
    }
  }, [applyPendingSeekToEmbed]);

  const handleSetAudioReady = useCallback(() => {
    applyPendingSeekToAudio();
    if (embedPlaying || pendingSeekRef.current != null) {
      setAudioRef.current?.play?.().catch(() => {});
    }
  }, [applyPendingSeekToAudio, embedPlaying]);

  const handleEmbedPlay = useCallback(() => {
    if (suppressEmbedSyncRef.current) return;
    pauseMainAudio?.();
    setMainPlaying?.(false);
    setEmbedPlaying(true);
    setEmbedEngaged(true);
  }, [pauseMainAudio, setMainPlaying]);

  const handleEmbedPause = useCallback(() => {
    setEmbedPlaying(false);
  }, []);

  const startCachedSetAudio = useCallback((targetUrl, seekSeconds, title) => {
    setEmbedDisplayTitle(title);
    setEmbedEngaged(true);
    setEmbedUrl(targetUrl);
    setSetAudioMode(true);
    pauseMainAudio?.();
    setMainPlaying?.(false);
    suppressEmbedSyncRef.current = false;
    pendingSeekRef.current = seekSeconds;
    setEmbedPlaying(true);
    window.setTimeout(() => {
      const el = setAudioRef.current;
      if (!el) return;
      if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
        applyPendingSeekToAudio();
      }
      el.play?.().catch(() => {});
    }, 50);
  }, [applyPendingSeekToAudio, pauseMainAudio, setMainPlaying]);

  const playSetEmbed = useCallback(async (seekSeconds = 0, url, opts = {}) => {
    const targetUrl = url ? normalizeSetUrl(url) : embedUrl;
    if (!targetUrl || !canPlaySetUrl(targetUrl)) return false;

    const title = opts.title || deriveSetTitle(targetUrl);
    const hasCached = await probeCachedSetAudio(targetUrl);
    if (hasCached) {
      if (url && normalizeSetUrl(url) !== embedUrl) {
        setSetAudioMode(false);
      }
      startCachedSetAudio(targetUrl, seekSeconds, title);
      return true;
    }

    setSetAudioMode(false);
    setEmbedDisplayTitle(title);
    setEmbedEngaged(true);

    if (url && normalizeSetUrl(url) !== embedUrl) {
      setEmbedUrl(targetUrl);
    }

    pauseMainAudio?.();
    setMainPlaying?.(false);
    suppressEmbedSyncRef.current = false;
    pendingSeekRef.current = seekSeconds;
    seekRetryCleanupRef.current?.();
    seekRetryCleanupRef.current = seekSetPlayerWithRetry(playerRef, seekSeconds);
    setEmbedPlaying(true);
    return true;
  }, [embedUrl, pauseMainAudio, setMainPlaying, startCachedSetAudio]);

  const resumeSetEmbed = useCallback(() => {
    pauseMainAudio?.();
    setMainPlaying?.(false);
    suppressEmbedSyncRef.current = false;
    setEmbedEngaged(true);
    if (setAudioModeRef.current) {
      setAudioRef.current?.play?.();
    } else {
      playerRef.current?.play?.();
    }
    setEmbedPlaying(true);
  }, [pauseMainAudio, setMainPlaying]);

  const toggleSetEmbed = useCallback(() => {
    if (embedPlaying) {
      pauseSetEmbed();
      return;
    }
    if (setAudioModeRef.current && setAudioRef.current) {
      resumeSetEmbed();
      return;
    }
    if (embedUrl && playerRef.current) {
      resumeSetEmbed();
      return;
    }
    playSetEmbed(0);
  }, [embedPlaying, embedUrl, pauseSetEmbed, playSetEmbed, resumeSetEmbed]);

  const seekSetEmbed = useCallback((seconds, opts = {}) => {
    const forceCachedAudio = !!opts.forceCachedAudio;
    pendingSeekRef.current = seconds;
    if (forceCachedAudio && embedUrl) {
      startCachedSetAudio(embedUrl, seconds, embedDisplayTitle || deriveSetTitle(embedUrl));
      return;
    }
    if (setAudioModeRef.current) {
      const el = setAudioRef.current;
      if (el) {
        try {
          el.currentTime = seconds;
          setSetAudioProgress(seconds);
        } catch {
          /* ignore */
        }
      }
      if (!embedPlaying) {
        startCachedSetAudio(embedUrl, seconds, embedDisplayTitle || deriveSetTitle(embedUrl));
        return;
      }
      el?.play?.();
      setEmbedPlaying(true);
      return;
    }
    seekRetryCleanupRef.current?.();
    seekRetryCleanupRef.current = seekSetPlayerWithRetry(playerRef, seconds);
    if (!embedPlaying) {
      playSetEmbed(seconds);
      return;
    }
    playerRef.current?.play?.();
    setEmbedPlaying(true);
  }, [embedDisplayTitle, embedPlaying, embedUrl, playSetEmbed, startCachedSetAudio]);

  const handleSetAudioTimeUpdate = useCallback(() => {
    const el = setAudioRef.current;
    if (!el) return;
    setSetAudioProgress(el.currentTime || 0);
    if (el.duration && Number.isFinite(el.duration)) {
      setSetAudioDuration(el.duration);
    }
  }, []);

  const handleSetAudioLoadedMetadata = useCallback(() => {
    const el = setAudioRef.current;
    if (el?.duration && Number.isFinite(el.duration)) {
      setSetAudioDuration(el.duration);
    }
    applyPendingSeekToAudio();
  }, [applyPendingSeekToAudio]);

  const seekSetAudioPreview = useCallback((seconds) => {
    setSetAudioProgress(seconds);
  }, []);

  const seekSetAudioCommit = useCallback((seconds) => {
    seekSetEmbed(seconds);
  }, [seekSetEmbed]);

  useEffect(() => {
    const el = setAudioRef.current;
    if (!el || !setAudioMode) return undefined;
    el.volume = volume;
    return undefined;
  }, [setAudioMode, volume]);

  const embedTitle = embedDisplayTitle || (embedUrl ? deriveSetTitle(embedUrl) : '');

  return {
    embedUrl,
    embedPlaying,
    embedEngaged,
    embedTitle,
    setAudioMode,
    setAudioRef,
    setAudioProgress,
    setAudioDuration,
    setAudioSrc: setAudioMode && embedUrl ? cachedSetAudioUrl(embedUrl) : '',
    anchorEl,
    playerRef,
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
  };
}
