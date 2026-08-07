import { useEffect, useRef } from 'react';
import { FastAverageColor } from 'fast-average-color';
import { analyzeTrackFeatures } from '../utils/trackFeatures';
import { proxiedCoverUrl, isTidalCoverUrl } from '../utils/coverUrl';
import { cancelInflightLyricsForKey, lyricsCacheKey, prefetchLyrics } from '../utils/lyrics';
import { tracksMatch } from '../utils/trackNormalize';
import { runWhenIdle } from '../utils/debounce';
import { apiGetJson } from '../utils/apiClient';
import { initAudioEngine } from '../utils/audioEngine';
import { PRELOAD_ENABLED } from '../utils/playerConfig';
import { findTheme, normalizeThemeId } from '../constants/themes';

export function usePlayerMediaEffects({
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
  djFeaturesActive = false,
  isPlaying = false,
}) {
  const prevLyricsKeyRef = useRef('');
  const volumePersistRef = useRef(null);

  useEffect(() => {
    // Apply to the elements immediately (responsive), but debounce the localStorage
    // write — a slider drag fires this many times a second and setItem is synchronous.
    const main = getMainAudioEl?.() ?? audioRef.current;
    const slots = [main, audioRef.current, preloadAudioRef.current].filter(Boolean);
    const unique = [...new Set(slots)];
    if (!fadeInPendingRef.current && !crossfadingRef.current) {
      unique.forEach((el) => { el.volume = volume; });
    }
    clearTimeout(volumePersistRef.current);
    volumePersistRef.current = setTimeout(() => {
      localStorage.setItem('tidal-volume', volume.toString());
    }, 400);
    return () => clearTimeout(volumePersistRef.current);
  }, [volume, audioRef, preloadAudioRef, getMainAudioEl, fadeInPendingRef, crossfadingRef]);

  useEffect(() => {
    const themeId = normalizeThemeId(theme);
    document.documentElement.setAttribute('data-theme', themeId);
    document.documentElement.style.colorScheme = findTheme(themeId).light ? 'light' : 'dark';
    localStorage.setItem('tidal-theme', themeId);
    document.documentElement.style.removeProperty('--accent-glow');
    document.documentElement.style.removeProperty('--accent-gradient');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('tidal-vis', String(visualizerEnabled));
    if (visualizerEnabled && audioRef?.current) {
      initAudioEngine(audioRef);
    }
  }, [visualizerEnabled, audioRef, currentAudioSrc]);

  // Computed every render (cheap -- one findIndex) so the preload effect
  // below can depend on a stable primitive instead of the raw `playlist`/
  // `currentTrack` objects. Those get a fresh reference on every
  // setPlaylist/setCurrentTrack call -- including playQueue's "same track
  // already playing" merge branch -- with no actual change to which track
  // should be preloaded next. Depending on the objects directly cancelled
  // and restarted this effect's setTimeout on every such incidental
  // re-render, so the 1.5-5s delay rarely elapsed and the next track's
  // audio often hadn't finished prefetching by the time it was needed.
  let preloadIdx = currentTrackIndex;
  if (currentTrack && playlist?.length) {
    const found = playlist.findIndex((tr) => tracksMatch(tr, currentTrack));
    if (found >= 0) preloadIdx = found;
  }
  if (preloadIdx < 0) preloadIdx = 0;
  const preloadTargetKey = `${preloadIdx}:${playlist?.[preloadIdx + 1]?.provider_id ?? ''}`;

  useEffect(() => {
    if (!PRELOAD_ENABLED || !mediaEnabled || !playlist?.length) return undefined;
    const idx = preloadIdx;

    let cancelled = false;
    let timerId;
    let attempts = 0;

    const runPreload = () => {
      if (cancelled) return;
      attempts += 1;
      const el = audioRef?.current;
      const currentBuffered = el && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
      if (currentBuffered || attempts >= 24) {
        updatePreloadForPlaylist(playlist, idx);
        return;
      }
      timerId = setTimeout(runPreload, 500);
    };

    // Preload next track for gapless handoff (crossfade window only when FEATURE_CROSSFADE).
    timerId = setTimeout(runPreload, isPlaying ? 1500 : 5000);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mediaEnabled,
    preloadTargetKey,
    currentAudioSrc,
    playbackQuality,
    updatePreloadForPlaylist,
    audioRef,
    isPlaying,
  ]);

  useEffect(() => {
    if (!PRELOAD_ENABLED) return;
    const el = preloadAudioRef.current;
    if (!el || !preloadAudioSrc) return;
    if (!el._sourceNode) el.load();
  }, [preloadAudioSrc, preloadAudioRef]);

  useEffect(() => {
    if (!mediaEnabled || !currentTrack?.provider_id) return undefined;
    const key = lyricsCacheKey(currentTrack);
    const prev = prevLyricsKeyRef.current;
    if (prev && prev !== key) {
      cancelInflightLyricsForKey(prev);
    }
    prevLyricsKeyRef.current = key;
    return undefined;
  }, [mediaEnabled, currentTrack?.provider_id, currentTrack?.title]);

  useEffect(() => {
    if (!mediaEnabled || !currentTrack?.provider_id || document.visibilityState === 'hidden') {
      return undefined;
    }
    const track = currentTrack;
    const timer = setTimeout(() => {
      runWhenIdle(() => prefetchLyrics(track));
    }, 1500);
    return () => clearTimeout(timer);
  }, [mediaEnabled, currentTrack?.provider_id, currentTrack?.title]);

  const trackPrefetchKey = currentTrack?.provider_id
    ? `${currentTrack.provider_id}:${currentAudioSrc}:${playbackQuality}`
    : '';

  useEffect(() => {
    if (!mediaEnabled) return;
    if (!currentTrack?.provider_id || !currentAudioSrc || document.visibilityState === 'hidden') return;
    if (!djFeaturesActive || !overlays.isDJOpen) return;
    const track = currentTrack;
    const src = currentAudioSrc;
    runWhenIdle(() => {
      analyzeTrackFeatures(track, src).catch(() => {});
    });
  }, [mediaEnabled, trackPrefetchKey, currentTrack, currentAudioSrc, overlays.isDJOpen, djFeaturesActive]);

  useEffect(() => {
    if (!mediaEnabled || !currentTrack?.provider_id) return undefined;
    const needsMeta = !currentTrack.cover_url
      || !isTidalCoverUrl(currentTrack.cover_url)
      || (!currentTrack.release_date && !currentTrack.year);
    if (!needsMeta) return undefined;
    let cancelled = false;
    const provider = currentTrack.provider || 'tidal';
    apiGetJson(`/api/track/${provider}/${currentTrack.provider_id}`, { auth: true })
      .catch(() => null)
      .then((meta) => {
        if (cancelled || !meta) return;
        setCurrentTrack((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cover_url: meta.cover_url || prev.cover_url,
            duration_s: prev.duration_s ?? meta.duration_s,
            release_date: prev.release_date ?? meta.release_date,
            year: prev.year ?? meta.year,
            album: prev.album || meta.album,
          };
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mediaEnabled, currentTrack?.provider_id, currentTrack?.provider, setCurrentTrack]);

  useEffect(() => {
    if (!mediaEnabled || !currentTrack) return undefined;
    const themeMeta = findTheme(normalizeThemeId(theme));
    if (currentTrack.cover_url && !themeMeta.light) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = proxiedCoverUrl(currentTrack.cover_url);
      img.onload = () => {
        try {
          const color = new FastAverageColor().getColor(img);
          if (color) {
            const rgb = `${color.value[0]}, ${color.value[1]}, ${color.value[2]}`;
            document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb}, 0.15)`);
            document.documentElement.style.setProperty(
              '--accent-gradient',
              `linear-gradient(135deg, rgba(${rgb}, 0.8), rgba(${rgb}, 0.2))`,
            );
            document.documentElement.style.setProperty('--accent-solid', `rgb(${rgb})`);
            let themeMeta = document.querySelector('meta[name="theme-color"]');
            if (!themeMeta) {
              themeMeta = document.createElement('meta');
              themeMeta.setAttribute('name', 'theme-color');
              document.head.appendChild(themeMeta);
            }
            themeMeta.setAttribute('content', `rgb(${rgb})`);
          }
        } catch (e) {
          console.error('FastAverageColor error', e);
        }
      };
    }
    return undefined;
  }, [mediaEnabled, currentTrack, theme]);
}
