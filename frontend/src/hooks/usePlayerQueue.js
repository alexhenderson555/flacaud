import { useCallback, useEffect, useMemo, useRef } from 'react';
import { showToast } from '../utils/toast';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import { fetchLibraryTracks } from '../utils/libraryApi';
import { hasAuthSession } from '../utils/hasAuthSession';
import { getTrackFeaturesSync } from '../utils/trackFeatures';
import { tracksMatch } from '../utils/trackNormalize';
import { pushRecentlyPlayed } from '../utils/recentlyPlayed';
import { PRELOAD_ENABLED } from '../utils/playerConfig';
import {
  getNextTrackIndex,
  getPreviousTrackIndex,
  shuffleTrackList,
  REPEAT_ONE,
  REPEAT_ALL,
  REPEAT_OFF,
} from '../utils/playbackModes';
import {
  resolveQueueIndex as resolveQueueIndexPure,
  clearTrackSwitchState,
  syncPlaylistRef,
  prepareAudioForNewTrack,
  unlockPlaybackElement,
  urlTargetsTrack,
  prepareMainAudioForTrackSwitch,
  clearIdleAudioSlot,
  resumePausedPlayback,
  resumeMainPlaybackAfterHandoff,
  isAtTrackEnd,
  hasAdequatePlaybackBuffer,
  shouldPreservePausedStream,
} from '../utils/playerTransportLogic';
import { initAudioEngine as setupAudioEngine, resumeAudioContext } from '../utils/audioEngine';
import {
  fetchVibeRadioBatch,
  mergeVibeRadioTracks,
  VIBE_RADIO_ORIGIN,
} from '../utils/vibeRadio';
import { ensureTrackPlaybackReady, trackNeedsPlaybackEnrich } from '../utils/libraryApi';
import { mergePlaybackTracks, normalizeTrack } from '../utils/trackNormalize';

/** Queue navigation, playback start/resume, and preload handoff. */
export function usePlayerQueue({
  audioRef,
  preloadAudioRef,
  volume,
  lang,
  t,
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
  skipEndedRef,
  skipAudioSrcSyncRef,
  pendingSeekRef,
  pendingPlayAfterSeekRef,
  modesRef,
  shuffleEnabled = false,
  repeatMode = 'off',
  setCurrentAudioSrc,
  currentAudioSrc = '',
  setPreloadAudioSrc,
  swapAudioSlots,
  getMainAudioEl,
  getPreloadAudioEl,
  deferPlayUntilReady = false,
  queueOriginRef,
  startTrackRadioRef,
  pauseSetEmbed,
  releaseSetEmbed,
}) {
  const playbackGenRef = useRef(0);
  const playNextInFlightRef = useRef(false);

  useEffect(() => {
    const pl = playlist || [];
    if (pl[0]?.__queue_origin && queueOriginRef) {
      queueOriginRef.current = pl[0].__queue_origin;
    }
  }, [playlist, queueOriginRef]);

  const initAudioEngine = useCallback(() => {
    const el = getMainAudioEl?.() ?? audioRef.current;
    setupAudioEngine({ current: el });
  }, [audioRef, getMainAudioEl]);

  const applyPlaybackTrack = useCallback((
    playable,
    contextPlaylist,
    { gen, main },
  ) => {
    if (gen !== playbackGenRef.current) return false;

    const trackId = String(playable.provider_id);
    clearTrackSwitchState({ pendingSeekRef, pendingPlayAfterSeekRef, skipEndedRef });
    crossfadingRef.current = false;
    crossfadeStartedForRef.current = null;
    pendingPlayRef.current = true;

    const normalizedTrack = normalizeTrack({ ...playable, provider_id: trackId });
    if (!normalizedTrack) return false;
    if (currentTrackRef) currentTrackRef.current = normalizedTrack;
    setCurrentTrack(normalizedTrack);
    pushRecentlyPlayed(playable);

    if (contextPlaylist?.length) {
      const normalized = contextPlaylist.map((tr) => {
        const row = normalizeTrack(tr) || tr;
        return { ...row, provider_id: String(row.provider_id) };
      });
      queueOriginRef.current = normalized[0]?.__queue_origin || null;
      syncPlaylistRef(playlistRef, normalized);
      setPlaylist(normalized);
      const idx = normalized.findIndex((tr) => String(tr.provider_id) === trackId);
      setCurrentTrackIndex(idx >= 0 ? idx : 0);
    } else {
      const activePlaylist = playlistRef.current || [];
      if (activePlaylist.length) {
        const idx = activePlaylist.findIndex((tr) => String(tr.provider_id) === trackId);
        if (idx !== -1) setCurrentTrackIndex(idx);
      }
    }

    setIsPlaying(true);
    setIsLoading(true);
    setProgress(0);
    prepareAudioForNewTrack(main, volume);
    return true;
  }, [
    volume, setCurrentTrack, setPlaylist, setCurrentTrackIndex,
    setIsPlaying, setIsLoading, setProgress, playlistRef, pendingPlayRef,
    pendingSeekRef, pendingPlayAfterSeekRef, skipEndedRef, crossfadingRef,
    crossfadeStartedForRef, currentTrackRef, queueOriginRef,
  ]);

  const beginPlayback = useCallback((track, contextPlaylist = null) => {
    const gen = playbackGenRef.current + 1;
    playbackGenRef.current = gen;

    releaseSetEmbed?.();
    pauseSetEmbed?.();

    if (skipAudioSrcSyncRef) skipAudioSrcSyncRef.current = null;

    const initial = normalizeTrack(track) || track;
    if (!initial?.provider_id) return;

    initAudioEngine();
    resumeAudioContext();
    const main = getMainAudioEl?.() ?? audioRef.current;
    // Arm before pause() — onPause must not clear isPlaying during track switch.
    pendingPlayRef.current = true;
    setIsPlaying(true);
    setIsLoading(true);
    unlockPlaybackElement(main);
    prepareMainAudioForTrackSwitch(main);
    setCurrentAudioSrc?.('');

    if (!applyPlaybackTrack(initial, contextPlaylist, { gen, main })) return;

    if (!trackNeedsPlaybackEnrich(initial)) return;

    void (async () => {
      const enriched = await ensureTrackPlaybackReady(track, lang);
      if (gen !== playbackGenRef.current) return;
      const playable = normalizeTrack(enriched || track);
      if (!playable?.provider_id) return;
      if (String(playable.provider_id) !== String(initial.provider_id)) return;
      applyPlaybackTrack(playable, contextPlaylist, { gen, main });
    })();
  }, [
    initAudioEngine, applyPlaybackTrack, audioRef, getMainAudioEl, pauseSetEmbed,
    releaseSetEmbed, lang, setCurrentAudioSrc, skipAudioSrcSyncRef,
  ]);

  const playQueue = useCallback((track, contextPlaylist) => {
    if (!track) return;
    initAudioEngine();
    const trackId = String(track.provider_id);
    const normalized = (contextPlaylist || []).map((tr) => ({
      ...tr,
      provider_id: String(tr.provider_id),
    }));
    queueOriginRef.current = normalized[0]?.__queue_origin || null;
    const playingId = currentTrackRef.current
      ? String(currentTrackRef.current.provider_id)
      : null;

    syncPlaylistRef(playlistRef, normalized);
    setPlaylist(normalized);
    const idx = normalized.findIndex((tr) => String(tr.provider_id) === trackId);
    setCurrentTrackIndex(idx >= 0 ? idx : 0);

    if (playingId === trackId) {
      const merged = mergePlaybackTracks(currentTrackRef.current, track);
      setCurrentTrack(merged);
      if (currentTrackRef) currentTrackRef.current = merged;
      const main = getMainAudioEl?.() ?? audioRef.current;
      if (main?.paused) {
        releaseSetEmbed?.();
        pauseSetEmbed?.();
        resumePausedPlayback(main, {
          deferPlayUntilReady,
          pendingPlayRef,
          setIsPlaying,
          setIsLoading,
        });
      } else {
        setIsLoading(false);
      }
      return;
    }

    beginPlayback(track, normalized);
  }, [
    initAudioEngine, beginPlayback, setPlaylist, setCurrentTrackIndex, setCurrentTrack,
    setIsPlaying, setIsLoading, audioRef, getMainAudioEl, currentTrackRef, pendingPlayRef, playlistRef,
    deferPlayUntilReady, queueOriginRef, pauseSetEmbed, releaseSetEmbed,
  ]);

  const playShuffledQueue = useCallback((contextPlaylist) => {
    const list = shuffleTrackList(contextPlaylist || []);
    if (!list.length) return;
    playQueue(list[0], list);
  }, [playQueue]);

  const togglePlay = useCallback((track, contextPlaylist = null) => {
    const trackId = String(track.provider_id);
    const playingId = currentTrackRef.current
      ? String(currentTrackRef.current.provider_id)
      : null;
    const main = getMainAudioEl?.() ?? audioRef.current;

    resumeAudioContext();
    unlockPlaybackElement(main);

    if (playingId === trackId) {
      const merged = mergePlaybackTracks(currentTrackRef.current, track);
      if (currentTrackRef) currentTrackRef.current = merged;
      const dur = Number(merged?.duration_s ?? merged?.duration ?? 0);
      const preserving = main?.paused && shouldPreservePausedStream(main, trackId, dur, {
        activeStreamUrl: currentAudioSrc || main?.currentSrc || main?.src || '',
      });

      if (main && !main.paused) {
        setCurrentTrack(merged);
        main.pause();
        setIsPlaying(false);
        return;
      }

      if (!preserving) {
        setCurrentTrack(merged);
      }
      if (contextPlaylist?.length) {
        const normalized = contextPlaylist.map((tr) => ({
          ...tr,
          provider_id: String(tr.provider_id),
        }));
        queueOriginRef.current = normalized[0]?.__queue_origin || null;
        syncPlaylistRef(playlistRef, normalized);
        setPlaylist(normalized);
        const idx = normalized.findIndex((tr) => String(tr.provider_id) === trackId);
        setCurrentTrackIndex(idx >= 0 ? idx : 0);
      }
      pauseSetEmbed?.();
      releaseSetEmbed?.();
      initAudioEngine();
      if (preserving) {
        resumePausedPlayback(main, {
          deferPlayUntilReady,
          pendingPlayRef,
          setIsPlaying,
          setIsLoading,
        });
        return;
      }
      const needsReload = !main
        || main.ended
        || isAtTrackEnd(main, dur)
        || !(main.currentSrc || main.src);
      if (needsReload) {
        beginPlayback(track, contextPlaylist);
        return;
      }
      resumePausedPlayback(main, {
        deferPlayUntilReady,
        pendingPlayRef,
        setIsPlaying,
        setIsLoading,
      });
      return;
    }

    beginPlayback(track, contextPlaylist);
  }, [
    beginPlayback, playQueue, audioRef, getMainAudioEl, currentTrackRef, initAudioEngine,
    deferPlayUntilReady, setIsLoading, setIsPlaying, pendingPlayRef, pauseSetEmbed, releaseSetEmbed,
    queueOriginRef, playlistRef, setPlaylist, setCurrentTrackIndex, setCurrentTrack,
    currentAudioSrc,
  ]);

  const handleReorderQueue = useCallback((newPlaylist) => {
    const normalized = newPlaylist.map((tr) => {
      const id = String(tr.provider_id);
      return tr.provider_id === id ? tr : { ...tr, provider_id: id };
    });
    if (currentTrackRef.current) {
      const newIndex = normalized.findIndex((tr) => tracksMatch(tr, currentTrackRef.current));
      if (newIndex !== -1) setCurrentTrackIndex(newIndex);
    }
    syncPlaylistRef(playlistRef, normalized);
    setPlaylist(normalized);
  }, [setPlaylist, setCurrentTrackIndex, currentTrackRef, playlistRef]);

  const resolveQueueIndex = useCallback(() => (
    resolveQueueIndexPure(
      playlistRef.current,
      currentTrackIndexRef.current,
      currentTrackRef.current,
    )
  ), [playlistRef, currentTrackIndexRef, currentTrackRef]);

  const applyTrackMetadata = useCallback((track, { progress = 0 } = {}) => {
    if (!track?.provider_id) return null;
    const normalized = normalizeTrack({ ...track, provider_id: String(track.provider_id) });
    if (!normalized) return null;
    if (currentTrackRef) currentTrackRef.current = normalized;
    setCurrentTrack(normalized);
    pushRecentlyPlayed(normalized);
    const pl = playlistRef.current || [];
    const idx = pl.findIndex((tr) => String(tr.provider_id) === normalized.provider_id);
    if (idx >= 0) setCurrentTrackIndex(idx);
    setProgress(progress);
    return normalized;
  }, [currentTrackRef, setCurrentTrack, setCurrentTrackIndex, setProgress, playlistRef]);

  const advanceToNextTrack = useCallback(() => {
    const pl = playlistRef.current || [];
    if (!pl.length) return null;
    const idx = resolveQueueIndex();
    const safeIdx = idx >= 0 ? idx : 0;
    const modes = modesRef?.current || { shuffle: shuffleEnabled, repeat: repeatMode };
    const nextIdx = getNextTrackIndex(pl, safeIdx, modes);
    if (nextIdx < 0) return null;
    const next = pl[nextIdx];
    setCurrentTrackIndex(nextIdx);
    applyTrackMetadata(next, { progress: 0 });
    return next;
  }, [
    resolveQueueIndex, applyTrackMetadata, setCurrentTrackIndex,
    modesRef, shuffleEnabled, repeatMode, playlistRef,
  ]);

  const tryPreloadHandoff = useCallback((nextTrack, { resumeAt = 0 } = {}) => {
    if (!PRELOAD_ENABLED) return false;
    if (!nextTrack?.provider_id || !swapAudioSlots) return false;
    const main = getMainAudioEl?.() ?? audioRef.current;
    const pre = getPreloadAudioEl?.() ?? preloadAudioRef.current;
    if (!main || !pre) return false;

    const nextId = String(nextTrack.provider_id);
    const handoffUrl = pre.currentSrc || preloadAudioSrc || '';
    if (!handoffUrl || !urlTargetsTrack(handoffUrl, nextId)) return false;
    if (pre.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    const nextDur = Number(nextTrack.duration_s ?? nextTrack.duration ?? 0);
    if (!hasAdequatePlaybackBuffer(pre, nextDur, { minAheadSec: 12 })) return false;

    pendingPlayRef.current = true;
    setIsLoading(true);
    setIsPlaying(true);

    applyTrackMetadata(nextTrack, { progress: resumeAt > 0.05 ? resumeAt : 0 });

    prepareMainAudioForTrackSwitch(main);
    if (handoffUrl && skipAudioSrcSyncRef) {
      skipAudioSrcSyncRef.current = handoffUrl;
    }
    setCurrentAudioSrc?.(handoffUrl);
    setPreloadAudioSrc?.('');
    swapAudioSlots();

    const playing = getMainAudioEl?.() ?? audioRef.current;
    const idle = getPreloadAudioEl?.() ?? preloadAudioRef.current;
    clearIdleAudioSlot(idle);
    if (!playing) return false;
    if (resumeAt > 0.05) {
      try {
        playing.currentTime = resumeAt;
      } catch {
        /* ignore */
      }
    }
    resumeMainPlaybackAfterHandoff(playing, {
      pendingPlayRef,
      setIsPlaying,
      setIsLoading,
      volume,
      onEngineInit: initAudioEngine,
    });
    if (pendingSeekRef) pendingSeekRef.current = null;
    if (pendingPlayAfterSeekRef) pendingPlayAfterSeekRef.current = false;
    if (skipEndedRef) skipEndedRef.current = false;
    return true;
  }, [
    audioRef, preloadAudioRef, preloadAudioSrc, skipAudioSrcSyncRef, swapAudioSlots,
    getMainAudioEl, getPreloadAudioEl, initAudioEngine,
    setCurrentAudioSrc, setPreloadAudioSrc, volume, setIsPlaying, setIsLoading,
    pendingPlayRef, pendingSeekRef, pendingPlayAfterSeekRef, skipEndedRef, applyTrackMetadata,
  ]);

  const appendVibeRadioTracks = useCallback(async (pl) => {
    const isVibeRadio = queueOriginRef?.current === VIBE_RADIO_ORIGIN
      || pl?.[0]?.__queue_origin === VIBE_RADIO_ORIGIN;
    if (!isVibeRadio) return false;
    if (queueOriginRef) queueOriginRef.current = VIBE_RADIO_ORIGIN;
    try {
      const excludeIds = pl.map((tr) => String(tr.provider_id));
      const genre = pl[0]?.__queue_genre || null;
      const incoming = await fetchVibeRadioBatch({ apiGetJson, lang, excludeIds, genre });
      const merged = mergeVibeRadioTracks(pl, incoming);
      if (genre) {
        merged.forEach(tr => { if (!tr.__queue_genre) tr.__queue_genre = genre; });
      }
      if (merged.length <= pl.length) return false;
      syncPlaylistRef(playlistRef, merged);
      setPlaylist(merged);
      return true;
    } catch {
      return false;
    }
  }, [lang, playlistRef, queueOriginRef, setPlaylist]);

  const prefetchVibeRadioIfNeeded = useCallback(async (pl, safeIdx) => {
    if (queueOriginRef?.current !== VIBE_RADIO_ORIGIN && pl?.[0]?.__queue_origin !== VIBE_RADIO_ORIGIN) {
      return;
    }
    if (queueOriginRef) queueOriginRef.current = VIBE_RADIO_ORIGIN;
    if (safeIdx < pl.length - 3) return;
    await appendVibeRadioTracks(pl);
  }, [appendVibeRadioTracks, queueOriginRef]);

  const playNext = useCallback(async () => {
    if (crossfadingRef.current) return;
    if (playNextInFlightRef.current) return;
    playNextInFlightRef.current = true;
    try {
      crossfadingRef.current = false;
      crossfadeStartedForRef.current = null;
      pendingPlayRef.current = true;
      setIsLoading(true);
      setIsPlaying(true);
      const pl = playlistRef.current || [];
      if (pl[0]?.__queue_origin && queueOriginRef) {
        queueOriginRef.current = pl[0].__queue_origin;
      }
      if (pl.length > 0) {
        const idx = resolveQueueIndex();
        const safeIdx = idx >= 0 ? idx : 0;
        const modes = modesRef?.current || { shuffle: shuffleEnabled, repeat: repeatMode };
        const nextIdx = getNextTrackIndex(pl, safeIdx, modes);
        if (nextIdx < 0) {
          if (queueOriginRef?.current === VIBE_RADIO_ORIGIN && await appendVibeRadioTracks(pl)) {
            const extended = playlistRef.current || [];
            const retryIdx = getNextTrackIndex(extended, safeIdx, modes);
            if (retryIdx >= 0) {
              const next = extended[retryIdx];
              if (tryPreloadHandoff(next)) return;
              beginPlayback(next, extended);
              return;
            }
          }
          const cur = pl[safeIdx] || currentTrackRef.current;
          if (
            modes.repeat === REPEAT_OFF
            && cur?.provider_id
            && startTrackRadioRef?.current
          ) {
            const started = await startTrackRadioRef.current(cur, { advancePastSeed: true });
            if (started) return;
          }
          setIsPlaying(false);
          setIsLoading(false);
          pendingPlayRef.current = false;
          return;
        }
        void prefetchVibeRadioIfNeeded(pl, safeIdx);
        const next = pl[nextIdx];
        if (tracksMatch(next, pl[safeIdx])) {
          if (modes.repeat === REPEAT_ALL || modes.repeat === REPEAT_ONE) {
            const main = getMainAudioEl?.() ?? audioRef.current;
            if (main) {
              main.currentTime = 0;
            }
            setProgress(0);
            pendingPlayRef.current = true;
            setIsPlaying(true);
            resumeMainPlaybackAfterHandoff(main, {
              pendingPlayRef,
              setIsPlaying,
              setIsLoading,
              volume,
              onEngineInit: initAudioEngine,
            });
            return;
          }
          setIsPlaying(false);
          setIsLoading(false);
          pendingPlayRef.current = false;
          return;
        }
        if (tryPreloadHandoff(next)) return;
        beginPlayback(next, pl);
        return;
      }

      const cur = currentTrackRef.current;
      if (!cur) return;
      setIsLoading(true);
      try {
        const getHarmonicMatches = (key) => {
          const match = key?.match?.(/(\d+)([AB])/i);
          if (!match) return [key];
          const n = parseInt(match[1], 10);
          const letter = match[2].toUpperCase();
          const other = letter === 'A' ? 'B' : 'A';
          const nextN = n === 12 ? 1 : n + 1;
          const prevN = n === 1 ? 12 : n - 1;
          return [`${n}${letter}`, `${nextN}${letter}`, `${prevN}${letter}`, `${n}${other}`];
        };

        if (hasAuthSession()) {
          try {
            const library = await fetchLibraryTracks(lang);
            const { bpm: cBpm, camelotKey: cKey } = getTrackFeaturesSync(cur);
            const allowedKeys = getHarmonicMatches(cKey);
            const existingIds = new Set(pl.map((tr) => String(tr.provider_id)));
            const candidates = library.filter((tr) => {
              if (existingIds.has(String(tr.provider_id))) return false;
              const { bpm, camelotKey } = getTrackFeaturesSync(tr);
              return allowedKeys.includes(camelotKey) && Math.abs(bpm - cBpm) <= 5;
            });
            if (candidates.length > 0) {
              const next = candidates[Math.floor(Math.random() * candidates.length)];
              const newPl = [...pl, { ...next, provider_id: String(next.provider_id) }];
              syncPlaylistRef(playlistRef, newPl);
              setPlaylist(newPl);
              beginPlayback(next, newPl);
              setIsLoading(false);
              showToast(t('autoDjMatch'));
              return;
            }
          } catch {
            /* fall through to artist top */
          }
        }

        try {
          const data = await apiGetJson(`/api/artist/${cur.artist_ids?.[0]}`, { lang });
          if (data.top_tracks?.length > 0) {
            const existingIds = new Set(pl.map((tr) => String(tr.provider_id)));
            const newTracks = data.top_tracks
              .filter((tr) => !existingIds.has(String(tr.provider_id)))
              .map((tr) => ({ ...tr, provider_id: String(tr.provider_id) }));
            if (newTracks.length > 0) {
              const newPl = [...pl, ...newTracks];
              syncPlaylistRef(playlistRef, newPl);
              setPlaylist(newPl);
              beginPlayback(newTracks[0], newPl);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        showToast(messageForApiError(e, lang));
      }
      setIsLoading(false);
    } finally {
      playNextInFlightRef.current = false;
    }
  }, [
    resolveQueueIndex, beginPlayback, setPlaylist, setIsLoading, setProgress, t, lang, playlistRef,
    currentTrackRef, modesRef, shuffleEnabled, repeatMode, audioRef, getMainAudioEl, setIsPlaying,
    tryPreloadHandoff, crossfadingRef, crossfadeStartedForRef, queueOriginRef,
    appendVibeRadioTracks, prefetchVibeRadioIfNeeded, pendingPlayRef,
    initAudioEngine, volume, startTrackRadioRef,
  ]);

  const playPrevious = useCallback(() => {
    const cur = currentTrackRef.current;
    if (!cur) return;
    const main = getMainAudioEl?.() ?? audioRef.current;
    const currentTime = main?.currentTime || 0;
    if (currentTime > 3) {
      if (main) main.currentTime = 0;
      return;
    }
    const pl = playlistRef.current || [];
    if (pl.length > 0) {
      const idx = resolveQueueIndex();
      const safeIdx = idx >= 0 ? idx : 0;
      const modes = modesRef?.current || { shuffle: shuffleEnabled, repeat: repeatMode };
      const prevIdx = getPreviousTrackIndex(pl, safeIdx, modes);
      if (prevIdx >= 0) beginPlayback(pl[prevIdx], pl);
    }
  }, [resolveQueueIndex, beginPlayback, audioRef, getMainAudioEl, currentTrackRef, playlistRef, modesRef, shuffleEnabled, repeatMode]);

  const nextTrack = useMemo(() => {
    if (!playlist?.length) return null;
    let idx = currentTrackIndex;
    if (idx < 0 || idx >= playlist.length || !tracksMatch(playlist[idx], currentTrack)) {
      idx = currentTrack ? playlist.findIndex((tr) => tracksMatch(tr, currentTrack)) : -1;
    }
    if (idx < 0) return null;
    const modes = { shuffle: shuffleEnabled, repeat: repeatMode };
    const nextIdx = getNextTrackIndex(playlist, idx, modes);
    if (nextIdx < 0) return null;
    const next = playlist[nextIdx];
    if (modes.repeat !== REPEAT_ONE && currentTrack && tracksMatch(next, currentTrack)) {
      return null;
    }
    return next;
  }, [playlist, currentTrackIndex, currentTrack, shuffleEnabled, repeatMode]);

  return {
    beginPlayback,
    playQueue,
    playShuffledQueue,
    togglePlay,
    handleReorderQueue,
    resolveQueueIndex,
    advanceToNextTrack,
    tryPreloadHandoff,
    playNext,
    playPrevious,
    nextTrack,
    initAudioEngine,
  };
}
