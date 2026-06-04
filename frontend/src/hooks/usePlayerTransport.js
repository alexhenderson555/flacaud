import { useCallback, useEffect, useMemo } from 'react';
import { showToast } from '../utils/toast';
import { CROSSFADE_SEC } from '../utils/playerConfig';
import { getTrackFeaturesSync } from '../utils/trackFeatures';
import { tracksMatch } from '../utils/trackNormalize';

function formatTime(secs) {
  if (!secs || Number.isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function usePlayerTransport({
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
}) {
  const initAudioEngine = useCallback(() => {
    if (!window.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      window.audioCtx = new AudioContext();
    }
    const ctx = window.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    if (audioRef.current && !audioRef.current._sourceNode) {
      try {
        const source = ctx.createMediaElementSource(audioRef.current);
        audioRef.current._sourceNode = source;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        audioRef.current._analyser = analyser;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (err) {
        console.warn('Audio routing failed:', err);
      }
    }
  }, [audioRef]);

  const togglePlay = useCallback((track, contextPlaylist = null) => {
    initAudioEngine();
    const trackId = String(track.provider_id);
    const activePlaylist = contextPlaylist || playlistRef.current || [];
    const playing = currentTrackRef.current;
    const playingId = playing ? String(playing.provider_id) : null;

    if (playingId === trackId) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      } else {
        audioRef.current?.play();
      }
      return;
    }

    pendingPlayRef.current = true;
    setCurrentTrack({ ...track, provider_id: trackId });

    if (contextPlaylist) {
      const normalized = contextPlaylist.map((tr) => ({ ...tr, provider_id: String(tr.provider_id) }));
      setPlaylist(normalized);
      const idx = normalized.findIndex((tr) => String(tr.provider_id) === trackId);
      setCurrentTrackIndex(idx >= 0 ? idx : 0);
    } else if (activePlaylist.length) {
      const idx = activePlaylist.findIndex((tr) => String(tr.provider_id) === trackId);
      if (idx !== -1) setCurrentTrackIndex(idx);
    }

    setIsPlaying(false);
    setIsLoading(true);
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [
    initAudioEngine, volume, setCurrentTrack, setPlaylist, setCurrentTrackIndex,
    setIsPlaying, setIsLoading, setProgress, audioRef, playlistRef, currentTrackRef, pendingPlayRef,
  ]);

  const handleReorderQueue = useCallback((newPlaylist) => {
    const normalized = newPlaylist.map((tr) => ({ ...tr, provider_id: String(tr.provider_id) }));
    if (currentTrackRef.current) {
      const newIndex = normalized.findIndex((tr) => tracksMatch(tr, currentTrackRef.current));
      if (newIndex !== -1) setCurrentTrackIndex(newIndex);
    }
    setPlaylist(normalized);
  }, [setPlaylist, setCurrentTrackIndex, currentTrackRef]);

  const resolveQueueIndex = useCallback(() => {
    const pl = playlistRef.current || [];
    if (!pl.length) return -1;
    const idx = currentTrackIndexRef.current;
    if (idx >= 0 && idx < pl.length && tracksMatch(pl[idx], currentTrackRef.current)) {
      return idx;
    }
    return pl.findIndex((tr) => tracksMatch(tr, currentTrackRef.current));
  }, [playlistRef, currentTrackIndexRef, currentTrackRef]);

  const playNext = useCallback(async () => {
    const pl = playlistRef.current || [];
    if (pl.length > 0) {
      const idx = resolveQueueIndex();
      const safeIdx = idx >= 0 ? idx : 0;
      togglePlay(pl[(safeIdx + 1) % pl.length], pl);
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

      const token = localStorage.getItem('tidal-token');
      if (token) {
        const libRes = await fetch('/api/library', { headers: { Authorization: `Bearer ${token}` } });
        if (libRes.ok) {
          const library = await libRes.json();
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
            setPlaylist(newPl);
            togglePlay(next, newPl);
            setIsLoading(false);
            showToast(t('autoDjMatch'));
            return;
          }
        }
      }

      const res = await fetch(`/api/artist/${cur.artist_ids?.[0]}`);
      if (res.ok) {
        const data = await res.json();
        if (data.top_tracks?.length > 0) {
          const existingIds = new Set(pl.map((tr) => String(tr.provider_id)));
          const newTracks = data.top_tracks
            .filter((tr) => !existingIds.has(String(tr.provider_id)))
            .map((tr) => ({ ...tr, provider_id: String(tr.provider_id) }));
          if (newTracks.length > 0) {
            const newPl = [...pl, ...newTracks];
            setPlaylist(newPl);
            togglePlay(newTracks[0], newPl);
            setIsLoading(false);
            return;
          }
        }
      }
    } catch (e) {
      console.error('Radio mode failed:', e);
    }
    setIsLoading(false);
  }, [resolveQueueIndex, togglePlay, setPlaylist, setIsLoading, t, playlistRef, currentTrackRef]);

  const playPrevious = useCallback(() => {
    const cur = currentTrackRef.current;
    if (!cur) return;
    const currentTime = audioRef.current?.currentTime || 0;
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    const pl = playlistRef.current || [];
    if (pl.length > 0) {
      const idx = resolveQueueIndex();
      const safeIdx = idx >= 0 ? idx : 0;
      togglePlay(pl[(safeIdx - 1 + pl.length) % pl.length], pl);
    }
  }, [resolveQueueIndex, togglePlay, audioRef, currentTrackRef, playlistRef]);

  const startTrackRadio = useCallback(async (track) => {
    setIsLoading(true);
    try {
      const vibeQuery = lang === 'ru'
        ? `Сыграй треки, похожие на ${track.title} от ${track.artists?.[0] || 'Unknown'}`
        : `Play tracks similar to ${track.title} by ${track.artists?.[0] || 'Unknown'}`;

      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: vibeQuery, limit: 15 }),
      });
      const data = await res.json();

      if (res.ok && data.tracks?.length > 0) {
        const normalized = data.tracks.map((tr) => ({ ...tr, provider_id: String(tr.provider_id) }));
        setPlaylist(normalized);
        togglePlay(normalized[0], normalized);
        showToast(t('trackRadioStarted'));
        return;
      }

      const artistId = track.artist_ids?.[0];
      if (artistId) {
        const artistRes = await fetch(`/api/artist/${artistId}`);
        if (artistRes.ok) {
          const artistData = await artistRes.json();
          const top = (artistData.top_tracks || []).map((tr) => ({
            ...tr,
            provider_id: String(tr.provider_id),
          }));
          if (top.length > 0) {
            setPlaylist(top);
            togglePlay(top[0], top);
            showToast(t('artistRadioStarted'));
            return;
          }
        }
      }
      showToast(t('radioFailed'));
    } catch {
      showToast(t('networkError'));
    } finally {
      setIsLoading(false);
    }
  }, [lang, setPlaylist, togglePlay, setIsLoading, t]);

  useEffect(() => {
    crossfadingRef.current = false;
    crossfadeStartedForRef.current = null;
  }, [currentTrack?.provider_id, crossfadingRef, crossfadeStartedForRef]);

  useEffect(() => {
    let animationFrameId;
    const updateProgress = () => {
      if (document.visibilityState === 'hidden') return;
      if (audioRef.current && trackDuration > 0 && progressRef.current && timeSpanRef.current) {
        const ct = audioRef.current.currentTime;
        progressRef.current.style.width = `${Math.min(100, (ct / trackDuration) * 100)}%`;
        const formatted = formatTime(ct);
        if (timeSpanRef.current.innerText !== formatted) {
          timeSpanRef.current.innerText = formatted;
        }

        const remaining = trackDuration - ct;
        const pl = playlistRef.current || [];
        const hasNext = pl.length > 1 && resolveQueueIndex() >= 0;
        const trackKey = currentTrackRef.current ? String(currentTrackRef.current.provider_id) : null;
        if (
          isPlaying &&
          !crossfadingRef.current &&
          hasNext &&
          preloadAudioSrc &&
          trackKey &&
          crossfadeStartedForRef.current !== trackKey &&
          remaining > 0 &&
          remaining <= CROSSFADE_SEC
        ) {
          crossfadingRef.current = true;
          crossfadeStartedForRef.current = trackKey;
          const fadeStart = performance.now();
          const fade = (now) => {
            const fadeT = Math.min(1, (now - fadeStart) / (CROSSFADE_SEC * 1000));
            if (audioRef.current) audioRef.current.volume = volume * (1 - fadeT);
            if (fadeT >= 1) {
              skipEndedRef.current = true;
              fadeInPendingRef.current = true;
              if (audioRef.current) {
                audioRef.current.volume = 0;
                audioRef.current.pause();
              }
              playNext();
            } else {
              requestAnimationFrame(fade);
            }
          };
          requestAnimationFrame(fade);
        }
      }
      if (isPlaying && document.visibilityState !== 'hidden') {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    const kick = () => {
      if (isPlaying && document.visibilityState !== 'hidden') {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };
    kick();
    document.addEventListener('visibilitychange', kick);
    return () => {
      document.removeEventListener('visibilitychange', kick);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [
    isPlaying, trackDuration, volume, preloadAudioSrc, playNext, resolveQueueIndex,
    audioRef, progressRef, timeSpanRef, playlistRef, currentTrackRef,
    crossfadingRef, crossfadeStartedForRef, fadeInPendingRef, skipEndedRef,
  ]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [playNext, playPrevious]);

  const nextTrack = useMemo(() => {
    if (!playlist?.length || playlist.length < 2) return null;
    let idx = currentTrackIndex;
    if (idx < 0 || idx >= playlist.length || !tracksMatch(playlist[idx], currentTrack)) {
      idx = currentTrack ? playlist.findIndex((tr) => tracksMatch(tr, currentTrack)) : -1;
    }
    if (idx < 0) return null;
    return playlist[(idx + 1) % playlist.length];
  }, [playlist, currentTrackIndex, currentTrack]);

  const handleSeek = useCallback((e) => {
    if (!trackDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * trackDuration;
    if (audioRef.current) audioRef.current.currentTime = newTime;
    setProgress(newTime);
  }, [trackDuration, audioRef, setProgress]);

  return {
    togglePlay,
    handleReorderQueue,
    playNext,
    playPrevious,
    startTrackRadio,
    nextTrack,
    handleSeek,
    formatTime,
  };
}
