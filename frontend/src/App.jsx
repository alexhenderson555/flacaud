import React, { useState, useRef, useEffect } from 'react';
import { showToast } from './utils/toast';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { Search, ListMusic, User, Waves, Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Mic2, Disc3, Heart, Download, Radio, Sliders, Flame, Disc, Plus, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AudioVisualizer from './components/AudioVisualizer';
import KaraokeMode from './components/KaraokeMode';
import DJMode from './components/DJMode';
import PlayerBar from './components/PlayerBar';
import LyricsView from './components/LyricsView';
import PlaybackQueue from './components/PlaybackQueue';
import Equalizer from './components/Equalizer';
import Titlebar from './components/Titlebar';
import DownloadToast from './components/DownloadToast';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import PlaylistModal from './components/PlaylistModal';
import { FastAverageColor } from 'fast-average-color';
import { getCachedAudioUrl } from './utils/cache';
import { Navigate } from 'react-router-dom';

const dict = {
  en: {
    search: 'Search & Shazam',
    library: 'Library',
    radio: 'My Vibe',
    transfer: 'Transfer Library',
    queue: 'Queue',
    account: 'Account',
    readyToPlay: 'Ready to play',
    selectTrack: 'Select a track',
    karaokeMode: 'Karaoke Mode',
    djTools: 'DJ Tools',
    moreOptions: 'More options',
    more: 'More',
    playlists: 'Playlists',
    trending: 'Trending',
    stemSplitter: 'Stem Splitter',
    loginToSave: 'Please login to save tracks',
    removedFromLibrary: 'Removed from library',
    addedToLibrary: 'Added to library',
    failedToRemove: 'Failed to remove track',
    failedToAdd: 'Failed to add track',
    networkError: 'Network error',
    recommendations: 'Recommendations',
    comingSoon: 'Coming soon!',
    startTrackRadio: 'Start Track Radio'
  },
  ru: {
    search: 'Поиск и Шазам',
    library: 'Медиатека',
    radio: 'Моя Волна',
    transfer: 'Перенос музыки',
    queue: 'Очередь',
    account: 'Профиль',
    readyToPlay: 'Готов к воспроизведению',
    selectTrack: 'Выберите трек',
    karaokeMode: 'Режим Караоке',
    djTools: 'Инструменты Диджея',
    moreOptions: 'Дополнительно',
    more: 'Ещё',
    playlists: 'Плейлисты',
    trending: 'В тренде',
    stemSplitter: 'Стем Сплиттер',
    loginToSave: 'Войдите, чтобы сохранять треки',
    removedFromLibrary: 'Удалено из медиатеки',
    addedToLibrary: 'Добавлено в медиатеку',
    failedToRemove: 'Ошибка при удалении',
    failedToAdd: 'Ошибка при добавлении',
    networkError: 'Ошибка сети',
    recommendations: 'Рекомендации',
    comingSoon: 'Скоро появится!',
    startTrackRadio: 'Радио по треку'
  }
};

function App() {
  const location = useLocation();
  const [currentTrack, setCurrentTrack] = useState(() => {
    const saved = localStorage.getItem('tidal-current-track');
    return saved ? JSON.parse(saved) : null;
  });
  const [playlist, setPlaylist] = useState(() => {
    const saved = localStorage.getItem('tidal-current-playlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => {
    const saved = localStorage.getItem('tidal-current-index');
    return saved ? parseInt(saved, 10) : -1;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackQuality, setPlaybackQuality] = useState(localStorage.getItem('tidal-quality') || 'LOW');
  const [currentAudioSrc, setCurrentAudioSrc] = useState('');
  const [preloadAudioSrc, setPreloadAudioSrc] = useState('');
  const [actualQuality, setActualQuality] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('tidal-theme') || 'default');
  const [visualizerEnabled, setVisualizerEnabled] = useState(localStorage.getItem('tidal-vis') === 'true');
  const [lang, setLang] = useState(localStorage.getItem('tidal-lang') || 'en');
  const [isEQOpen, setIsEQOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isDJOpen, setIsDJOpen] = useState(false);
  const [isKaraokeOpen, setIsKaraokeOpen] = useState(false);
  const [likedTracks, setLikedTracks] = useState(new Map());
  const [isPlaylistModalOpenPlayer, setIsPlaylistModalOpenPlayer] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleOverlay = (overlay) => {
    // Karaoke is an independent layer: it stays open when other panels open,
    // so opening DJ/EQ/queue over it doesn't kick the user out.
    if (overlay === 'karaoke') {
      const newKaraokeState = !isKaraokeOpen;
      if (newKaraokeState && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!newKaraokeState && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsKaraokeOpen(newKaraokeState);
      return;
    }

    // Side panels stay mutually exclusive among themselves, but never touch karaoke.
    setIsEQOpen(overlay === 'eq' ? !isEQOpen : false);
    setIsQueueOpen(overlay === 'queue' ? !isQueueOpen : false);
    setIsLyricsOpen(overlay === 'lyrics' ? !isLyricsOpen : false);
    setIsDJOpen(overlay === 'dj' ? !isDJOpen : false);
  };
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tidal-volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [downloadedTracks, setDownloadedTracks] = useState(new Set());
  const downloadedTracksRef = useRef(new Set());
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const timeSpanRef = useRef(null);
  
  const fetchLibrary = async () => {
    const token = localStorage.getItem('tidal-token');
    if (!token) return;
    try {
      const res = await fetch('/api/library', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const map = new Map();
        data.forEach(t => map.set(String(t.provider_id), t.id));
        setLikedTracks(map);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const toggleLike = async (track) => {
    if (!track) return;
    const token = localStorage.getItem('tidal-token');
    if (!token) {
      showToast(t('loginToSave'));
      return;
    }
    const pId = String(track.provider_id);
    const isLiked = likedTracks.has(pId);
    
    if (isLiked) {
      const dbId = likedTracks.get(pId);
      try {
        const res = await fetch(`/api/library/${dbId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const newMap = new Map(likedTracks);
          newMap.delete(pId);
          setLikedTracks(newMap);
          showToast(t('removedFromLibrary'));
        } else {
          showToast(t('failedToRemove'));
        }
      } catch (e) {
        showToast(t('networkError'));
      }
    } else {
      try {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            provider: track.provider || 'tidal',
            provider_id: pId,
            title: track.title,
            artists_json: JSON.stringify(track.artists || []),
            cover_url: track.cover_url,
            duration: track.duration_s || track.duration || 0,
            album: track.album || '',
            quality: track.quality || 'LOW'
          })
        });
        if (res.ok) {
          const data = await res.json();
          const newMap = new Map(likedTracks);
          newMap.set(pId, data.id);
          setLikedTracks(newMap);
          showToast(t('addedToLibrary'));
        } else {
          showToast(t('failedToAdd'));
        }
      } catch (e) {
        showToast(t('networkError'));
      }
    }
  };

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        const res = await fetch('/api/downloads');
        if (res.ok) {
          const data = await res.json();
          const newSet = new Set(Object.keys(data));
          setDownloadedTracks(newSet);
          downloadedTracksRef.current = newSet;
        }
      } catch (e) {}
    };
    fetchDownloads();
    const iv = setInterval(fetchDownloads, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    localStorage.setItem('tidal-current-track', JSON.stringify(currentTrack));
  }, [currentTrack]);

  useEffect(() => {
    localStorage.setItem('tidal-current-playlist', JSON.stringify(playlist));
    localStorage.setItem('tidal-current-index', currentTrackIndex.toString());
  }, [playlist, currentTrackIndex]);

  useEffect(() => {
    // We intentionally do not save playbackQuality to localStorage here,
    // so the quality selector acts as a temporary override.
  }, [playbackQuality]);

  useEffect(() => {
    localStorage.setItem('tidal-volume', volume.toString());
    if (audioRef.current) {
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
    localStorage.setItem('tidal-vis', visualizerEnabled);
  }, [visualizerEnabled]);

  useEffect(() => {
    localStorage.setItem('tidal-lang', lang);
  }, [lang]);

  useEffect(() => {
    const updateAudioSrc = async () => {
      if (!currentTrack) {
        setCurrentAudioSrc('');
        return;
      }
      let url = await getCachedAudioUrl(currentTrack, playbackQuality);
      if (!url) {
        const isDownloaded = downloadedTracksRef.current.has(currentTrack.provider_id);
        const bypass = isDownloaded ? 'false' : 'true';
        url = `/api/stream/${currentTrack.provider}/${currentTrack.provider_id}?quality=${playbackQuality}&bypass_registry=${bypass}&token=${localStorage.getItem('tidal-token') || ''}`;
        try {
          const qRes = await fetch(`/api/quality/${currentTrack.provider}/${currentTrack.provider_id}?quality=${playbackQuality}`);
          if (qRes.ok) {
            const qData = await qRes.json();
            setActualQuality(qData.quality || playbackQuality);
          } else {
            setActualQuality(playbackQuality);
          }
        } catch (e) {
          setActualQuality(playbackQuality);
        }
      } else {
        setActualQuality(playbackQuality);
      }
      setCurrentAudioSrc(url);
    };
    updateAudioSrc();
  }, [currentTrack, playbackQuality]);

  useEffect(() => {
    const updatePreloadSrc = async () => {
      if (playlist && currentTrackIndex >= 0 && currentTrackIndex < playlist.length - 1) {
        const nextTrack = playlist[currentTrackIndex + 1];
        let url = await getCachedAudioUrl(nextTrack, playbackQuality);
        if (!url) {
          const isDownloaded = downloadedTracksRef.current.has(nextTrack.provider_id);
          const bypass = isDownloaded ? 'false' : 'true';
          url = `/api/stream/${nextTrack.provider}/${nextTrack.provider_id}?quality=${playbackQuality}&bypass_registry=${bypass}&token=${localStorage.getItem('tidal-token') || ''}`;
        }
        setPreloadAudioSrc(url);
      } else {
        setPreloadAudioSrc('');
      }
    };
    updatePreloadSrc();
  }, [playlist, currentTrackIndex, playbackQuality]);

  useEffect(() => {
    if (currentTrack) {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artists ? currentTrack.artists.join(', ') : 'Unknown Artist',
          album: currentTrack.album || '',
          artwork: [
            { src: currentTrack.cover_url || 'https://via.placeholder.com/512', sizes: '512x512', type: 'image/jpeg' }
          ]
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
            const fac = new FastAverageColor();
            const color = fac.getColor(img);
            if (color) {
              const rgb = `${color.value[0]}, ${color.value[1]}, ${color.value[2]}`;
              document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb}, 0.15)`);
              document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, rgba(${rgb}, 0.8), rgba(${rgb}, 0.2))`);
              document.documentElement.style.setProperty('--accent-solid', `rgb(${rgb})`);
            }
          } catch (e) {
            console.error("FastAverageColor error", e);
          }
        };
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [playlist, currentTrackIndex]);

  const t = (key) => dict[lang][key] || key;

  const trackDuration = currentTrack?.duration_s || currentTrack?.duration || 0;

  useEffect(() => {
    let animationFrameId;
    const updateProgress = () => {
      if (audioRef.current && trackDuration > 0 && progressRef.current && timeSpanRef.current) {
        const ct = audioRef.current.currentTime;
        const percent = Math.min(100, (ct / trackDuration) * 100);
        progressRef.current.style.width = `${percent}%`;
        
        const formatted = formatTime(ct);
        if (timeSpanRef.current.innerText !== formatted) {
          timeSpanRef.current.innerText = formatted;
        }

        // Auto Crossfade logic (fade out last 7 seconds, fade in first 3 seconds)
        if (trackDuration - ct < 7) {
          const fadeFactor = Math.max(0, (trackDuration - ct) / 7);
          audioRef.current.volume = volume * fadeFactor;
        } else if (ct < 3) {
          const fadeFactor = ct / 3;
          audioRef.current.volume = volume * fadeFactor;
        } else {
          audioRef.current.volume = volume;
        }
      }
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateProgress);
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, trackDuration]);

  const initAudioEngine = () => {
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

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(12, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);

        source.connect(analyser);
        analyser.connect(compressor);
        compressor.connect(ctx.destination);
      } catch (err) {
        console.warn("Audio routing failed:", err);
      }
    }
  };

  const togglePlay = (track, contextPlaylist = null) => {
    initAudioEngine();
    
    if (currentTrack && currentTrack.provider_id === track.provider_id) {
      if (isPlaying) audioRef.current?.pause();
      else audioRef.current?.play();
    } else {
      setCurrentTrack(track);
      if (contextPlaylist) {
        setPlaylist(contextPlaylist);
        const idx = contextPlaylist.findIndex(t => t.provider_id === track.provider_id);
        setCurrentTrackIndex(idx);
      }
      setIsPlaying(false);
      setIsLoading(true);
      setProgress(0);
      
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(e => {
            if (e.name !== 'AbortError') {
              showToast(t('failedToStream') || 'Failed to stream track');
              setIsPlaying(false);
              setIsLoading(false);
            }
          });
        }
      }, 50);
    }
  };

  const handleReorderQueue = (newPlaylist) => {
    if (currentTrack) {
      const newIndex = newPlaylist.findIndex(t => t.provider_id === currentTrack.provider_id);
      if (newIndex !== -1 && newIndex !== currentTrackIndex) {
        setCurrentTrackIndex(newIndex);
      }
    }
    setPlaylist(newPlaylist);
  };

  const playNext = async () => {
    if (!playlist) return;
    
    if (currentTrackIndex < playlist.length - 1) {
      const nextTrack = playlist[currentTrackIndex + 1];
      togglePlay(nextTrack, playlist);
      return;
    }

    // Auto-DJ Harmonic Mixing Fallback
    if (currentTrack) {
      setIsLoading(true);
      try {
        const getMockFeatures = (t) => {
          if (t.bpm && t.key) return { bpm: t.bpm, key: t.key };
          const hash = String(t.provider_id).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
          const bpms = [120, 124, 128, 130, 95, 140, 115, 100];
          const keys = ['8A', '9A', '10A', '11A', '12A', '1A', '2A', '3A'];
          return { bpm: bpms[hash % bpms.length], key: keys[hash % keys.length] };
        };
        const getHarmonicMatches = (key) => {
           const match = key.match(/(\d+)([AB])/i);
           if (!match) return [key];
           const n = parseInt(match[1]);
           const l = match[2].toUpperCase();
           const otherL = l === 'A' ? 'B' : 'A';
           const nextN = n === 12 ? 1 : n + 1;
           const prevN = n === 1 ? 12 : n - 1;
           return [`${n}${l}`, `${nextN}${l}`, `${prevN}${l}`, `${n}${otherL}`];
        };

        const token = localStorage.getItem('tidal-token');
        if (token) {
          const libRes = await fetch('/api/library', { headers: { Authorization: `Bearer ${token}` } });
          if (libRes.ok) {
            const library = await libRes.json();
            const { bpm: cBpm, key: cKey } = getMockFeatures(currentTrack);
            const allowedKeys = getHarmonicMatches(cKey);
            const existingIds = new Set(playlist.map(t => t.provider_id));
            
            // Find harmonic match
            const candidates = library.filter(t => {
              if (existingIds.has(t.provider_id)) return false;
              const { bpm, key } = getMockFeatures(t);
              return allowedKeys.includes(key) && Math.abs(bpm - cBpm) <= 5;
            });

            if (candidates.length > 0) {
              // Pick random match
              const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
              const newPlaylist = [...playlist, nextTrack];
              setPlaylist(newPlaylist);
              togglePlay(nextTrack, newPlaylist);
              setIsLoading(false);
              showToast('Auto-DJ: Harmonic Match Found! 🎛️');
              return;
            }
          }
        }

        // Fallback to Radio if no harmonic match found
        const res = await fetch(`/api/artist/${currentTrack.artist_ids[0]}`);
        if (res.ok) {
          const data = await res.json();
          if (data.top_tracks?.length > 0) {
            const existingIds = new Set(playlist.map(t => t.provider_id));
            const newTracks = data.top_tracks.filter(t => !existingIds.has(t.provider_id));
            if (newTracks.length > 0) {
              const newPlaylist = [...playlist, ...newTracks];
              setPlaylist(newPlaylist);
              togglePlay(newTracks[0], newPlaylist);
              setIsLoading(false);
              return;
            }
          }
        }
      } catch (e) {
        console.error("Radio mode failed:", e);
      }
      setIsLoading(false);
    }
  };

  const startTrackRadio = async (track) => {
    setIsLoading(true);
    try {
      const vibeQuery = lang === 'ru'
        ? `Сыграй треки, похожие на ${track.title} от ${track.artists?.[0] || 'Unknown'}`
        : `Play tracks similar to ${track.title} by ${track.artists?.[0] || 'Unknown'}`;
      
      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: vibeQuery, limit: 15 })
      });
      const data = await res.json();
      
      if (res.ok && data.tracks && data.tracks.length > 0) {
        setPlaylist(data.tracks);
        togglePlay(data.tracks[0], data.tracks);
        showToast(lang === 'ru' ? 'Радио по треку запущено! 📻' : 'Track Radio started! 📻');
      } else {
        showToast(lang === 'ru' ? 'Не удалось запустить радио' : 'Could not start radio');
      }
    } catch (err) {
      showToast(lang === 'ru' ? 'Ошибка сети' : 'Network error');
    }
    setIsLoading(false);
  };

  const playPrevious = () => {
    if (!currentTrack) return;
    const currentTime = audioRef.current?.currentTime || 0;
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    } else if (playlist && currentTrackIndex > 0) {
      const prevTrack = playlist[currentTrackIndex - 1];
      togglePlay(prevTrack, playlist);
    }
  };

  const changeQuality = (newQ) => {
    if (newQ === playbackQuality) return;
    const time = audioRef.current?.currentTime || progress;
    const wasPlaying = isPlaying;
    setPlaybackQuality(newQ);
    setIsLoading(true);
    
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        if (wasPlaying) {
          audioRef.current.play().catch(e => {
             console.error(e);
             setIsLoading(false);
          });
        }
      }
    }, 100);
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    if (!trackDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * trackDuration;
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setProgress(newTime);
  };

  const handleDownloadPlayer = async () => {
    if (!currentTrack) return;
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({
          provider: currentTrack.provider,
          url: `https://tidal.com/track/${currentTrack.provider_id}`,
          quality: playbackQuality,
          type: 'track'
        })
      });
      const data = await res.json();
      if (res.ok) {
        const saved = localStorage.getItem('tidal-queue-jobs');
        const jobs = saved ? JSON.parse(saved) : [];
        jobs.push(data.job_id);
        localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
      } else {
        showToast('Failed to start download: ' + (data.detail || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      showToast('Error starting download');
    }
  };

  const playerContext = { 
    togglePlay, 
    playingTrackId: isPlaying && currentTrack ? currentTrack.provider_id : null,
    likedTracks,
    toggleLike,
    fetchLibrary,
    playbackQuality,
    setPlaybackQuality,
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
    startTrackRadio
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          if (currentTrack) {
            if (isPlaying) audioRef.current?.pause();
            else audioRef.current?.play();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          playNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playPrevious();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.05));
          break;
        case 'KeyL':
          toggleOverlay('lyrics');
          break;
        case 'KeyK':
          e.preventDefault();
          toggleOverlay('karaoke');
          break;
        case 'KeyK':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setIsCommandPaletteOpen(prev => !prev);
          }
          break;
        case 'KeyD':
          if (!e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            toggleOverlay('dj');
          }
          break;
        case 'KeyQ':
          e.preventDefault();
          toggleOverlay('queue');
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, isPlaying, playNext, playPrevious]);

  if (!localStorage.getItem('tidal-token') && location.pathname !== '/account') {
    return <Navigate to="/account" replace />;
  }

  return (
    <div className="app-container" style={{ paddingTop: window.__TAURI__ ? '38px' : '0' }}>
      <Titlebar />
      {visualizerEnabled ? (
        <AudioVisualizer audioRef={audioRef} />
      ) : (
        <>
          <div className="ambient-glow glow-1" />
          <div className="ambient-glow glow-2" />
          <div className="ambient-glow glow-3" />
        </>
      )}

      <nav className="sidebar">
        <Link to="/search" className="brand" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="FlacAudio" style={{ width: '32px', height: '32px', borderRadius: '8px' }} onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
          <Waves size={28} color="var(--accent-solid)" style={{ display: 'none' }} />
          <h1><span className="text-gradient">Flac</span>Audio</h1>
        </Link>

        <div className="nav-links">
          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '16px' }}>Discover</div>
          <NavLink to="/search" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Search size={20} />
            <span>{t('search')}</span>
          </NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => isActive ? "nav-item active hide-on-mobile" : "nav-item hide-on-mobile"}>
            <Flame size={20} />
            <span>{t('recommendations')}</span>
          </NavLink>
          <NavLink to="/radio" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Radio size={20} />
            <span>{t('radio')}</span>
          </NavLink>

          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '24px' }}>My Music</div>
          <NavLink to="/library" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Heart size={20} />
            <span>{t('library')}</span>
          </NavLink>
          <NavLink to="/playlists" className={({ isActive }) => isActive ? "nav-item active hide-on-mobile" : "nav-item hide-on-mobile"}>
            <ListMusic size={20} />
            <span>{t('playlists')}</span>
          </NavLink>
          <NavLink to="/sync" className={({ isActive }) => isActive ? "nav-item active nav-item-sync hide-on-mobile" : "nav-item hide-on-mobile"}>
            <Repeat size={20} />
            <span>{t('transfer')}</span>
          </NavLink>

          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '24px' }}>Pro Tools</div>
          <NavLink to="/analyzer" className={({ isActive }) => isActive ? "nav-item active hide-on-mobile" : "nav-item hide-on-mobile"}>
            <ListMusic size={20} />
            <span>Set Analyzer</span>
          </NavLink>
          <NavLink to="/splitter" className={({ isActive }) => isActive ? "nav-item active hide-on-mobile" : "nav-item hide-on-mobile"}>
            <Disc size={20} />
            <span>Stem Splitter</span>
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <User size={20} />
            <span>{t('account')}</span>
          </NavLink>
          <div className="nav-item mobile-only" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={20} />
            <span>{t('more')}</span>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            className="mobile-menu-overlay mobile-only"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(10, 10, 16, 0.95)',
              backdropFilter: 'blur(20px)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              padding: '40px 24px',
            }}
          >
            <div style={{ alignSelf: 'flex-end', marginBottom: '30px' }}>
              <button onClick={() => setIsMobileMenuOpen(false)} style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '50%' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '30px', color: 'var(--text-primary)' }}>{t('moreOptions')}</div>
            <div className="mobile-menu-content" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <NavLink to="/sync" className="nav-item" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Repeat size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('transfer')}</span>
              </NavLink>
              <div className="nav-item" onClick={() => { setIsMobileMenuOpen(false); alert(t('comingSoon')); }} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', cursor: 'pointer', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <ListMusic size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('playlists')}</span>
              </div>
              <div className="nav-item" onClick={() => { setIsMobileMenuOpen(false); alert(t('comingSoon')); }} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', cursor: 'pointer', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Flame size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('trending')}</span>
              </div>
              <div className="nav-item" onClick={() => { setIsMobileMenuOpen(false); alert(t('comingSoon')); }} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', cursor: 'pointer', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Disc size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('stemSplitter')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      <audio 
        ref={audioRef} 
        crossOrigin="anonymous"
        src={currentAudioSrc}
        onPlay={() => { setIsPlaying(true); setIsLoading(false); }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); playNext(); }}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onError={() => setIsLoading(false)}
      />

      <audio 
        preload="auto"
        src={preloadAudioSrc}
        style={{ display: 'none' }}
      />

      <AnimatePresence>
        {isKaraokeOpen && <KaraokeMode currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsKaraokeOpen(false)} />}
        {isDJOpen && <DJMode currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsDJOpen(false)} />}
        {isQueueOpen && <PlaybackQueue playlist={playlist} currentTrackIndex={currentTrackIndex} setPlaylist={handleReorderQueue} togglePlay={togglePlay} onClose={() => setIsQueueOpen(false)} />}
        {isEQOpen && <Equalizer audioCtx={window.audioCtx} audioRef={audioRef} onClose={() => setIsEQOpen(false)} />}
        {isPlaylistModalOpenPlayer && <PlaylistModal track={currentTrack} onClose={() => setIsPlaylistModalOpenPlayer(false)} />}
      </AnimatePresence>

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
        likedTracks={likedTracks}
        isKaraokeOpen={isKaraokeOpen}
        isDJOpen={isDJOpen}
        isEQOpen={isEQOpen}
        isQueueOpen={isQueueOpen}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        togglePlay={togglePlay}
        playPrevious={playPrevious}
        playNext={playNext}
        handleSeek={handleSeek}
        changeQuality={changeQuality}
        toggleLike={toggleLike}
        setIsPlaylistModalOpenPlayer={setIsPlaylistModalOpenPlayer}
        handleDownloadPlayer={handleDownloadPlayer}
        toggleOverlay={toggleOverlay}
        setVolume={setVolume}
        timeSpanRef={timeSpanRef}
        progressRef={progressRef}
        startTrackRadio={startTrackRadio}
      />
      
      {/* Hiding old code temporarily to not cause parsing errors */}
      {false && (
      <div className="player-bar glass-panel" style={{ borderBottom: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: 'var(--bg-surface-hover)', overflow: 'hidden' }}>
             {currentTrack?.cover_url ? (
               <img src={currentTrack.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
             ) : (
               <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Waves size={24} color="var(--text-muted)" />
               </div>
             )}
          </div>
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
               {currentTrack ? currentTrack.title : t('readyToPlay')}
               {currentTrack && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                   {actualQuality && (
                     <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--accent-solid)', borderRadius: '4px', color: '#fff' }}>
                       {actualQuality === 'HI_RES' || actualQuality === 'HI_RES_LOSSLESS' ? 'MAX' : actualQuality === 'LOSSLESS' ? 'FLAC' : actualQuality}
                     </span>
                   )}
                   {currentTrack.release_date && (
                     <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--bg-surface-hover)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                       {currentTrack.release_date.split('-')[0]}
                     </span>
                   )}
                 </div>
               )}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {currentTrack ? (
                currentTrack.artists ? currentTrack.artists.map((artistName, i) => {
                  const artistId = currentTrack.artist_ids?.[i];
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && ", "}
                      {artistId ? (
                        <Link to={`/artist/${artistId}`} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                          {artistName}
                        </Link>
                      ) : artistName}
                    </React.Fragment>
                  );
                }) : 'Unknown Artist'
              ) : t('selectTrack')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 2, justifyContent: 'center', color: 'var(--text-primary)' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
             <SkipBack 
               size={20} 
               opacity={currentTrack ? 1 : 0.5} 
               cursor={currentTrack ? "pointer" : "default"} 
               onClick={playPrevious}
             />
             <div 
                onClick={() => currentTrack && !isLoading && togglePlay(currentTrack)}
                style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentTrack && !isLoading ? 'pointer' : 'default', opacity: currentTrack ? 1 : 0.5, position: 'relative' }}
             >
               {isLoading ? (
                 <motion.div 
                   animate={{ rotate: 360 }} 
                   transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                   style={{ width: '18px', height: '18px', border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%' }}
                 />
               ) : (
                 isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '4px' }} />
               )}
             </div>
             <SkipForward 
               size={20} 
               opacity={(playlist.length > 0 && currentTrackIndex < playlist.length - 1) ? 1 : 0.5} 
               cursor={(playlist.length > 0 && currentTrackIndex < playlist.length - 1) ? "pointer" : "default"} 
               onClick={playNext}
             />
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '600px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
             <span ref={timeSpanRef} style={{ width: '45px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatTime(progress)}</span>
             <div 
               onClick={handleSeek}
               style={{ flex: 1, height: '8px', background: 'var(--bg-surface-hover)', borderRadius: '4px', cursor: trackDuration ? 'pointer' : 'default', position: 'relative', overflow: 'visible' }}
             >
               <div ref={progressRef} style={{ width: `${trackDuration ? Math.min(100, (progress/trackDuration)*100) : 0}%`, height: '100%', background: 'var(--accent-solid)', borderRadius: '4px', position: 'relative' }}>
                 <div style={{ 
                   position: 'absolute', 
                   right: '-6px', 
                   top: '50%', 
                   transform: 'translateY(-50%)', 
                   width: '12px', 
                   height: '12px', 
                   borderRadius: '50%', 
                   background: '#fff', 
                   boxShadow: '0 0 5px rgba(0,0,0,0.5)' 
                 }} />
               </div>
             </div>
             <span style={{ width: '45px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{formatTime(trackDuration)}</span>
           </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end', color: 'var(--text-secondary)' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '16px', borderRight: '1px solid var(--border-subtle)', paddingRight: '24px' }}>
             <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '20px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
               {[
                 { id: 'LOW', label: '96k', color: 'rgba(255,255,255,0.2)', level: 0 },
                 { id: 'HIGH', label: '320k', color: 'rgba(255,255,255,0.4)', level: 1 },
                 { id: 'LOSSLESS', label: 'FLAC', color: '#2575fc', level: 2 },
                 { id: 'HI_RES', label: 'MAX', color: '#ffb703', level: 3 }
               ].map(q => {
                 const isDisabled = false;

                 return (
                   <div 
                     key={q.id}
                     onClick={() => !isDisabled && changeQuality(q.id)}
                     style={{
                       padding: '4px 10px',
                       fontSize: '0.65rem',
                       fontWeight: playbackQuality === q.id ? 700 : 500,
                       color: playbackQuality === q.id ? '#fff' : (isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)'),
                       background: playbackQuality === q.id ? q.color : 'transparent',
                       borderRadius: '18px',
                       cursor: isDisabled ? 'not-allowed' : 'pointer',
                       opacity: isDisabled ? 0.3 : 1,
                       transition: 'all 0.2s ease',
                       boxShadow: playbackQuality === q.id && q.id !== 'LOW' && q.id !== 'HIGH' ? `0 0 10px ${q.color}60` : 'none',
                       textTransform: 'uppercase',
                       letterSpacing: '0.5px'
                     }}
                     title={isDisabled ? `Track not available in ${q.label}` : q.label}
                   >
                     {q.label}
                   </div>
                 );
               })}
             </div>
             
             <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginRight: '8px' }}>
                <Heart 
                  size={22} 
                  cursor={currentTrack ? "pointer" : "default"}
                  fill={currentTrack && likedTracks.has(String(currentTrack.provider_id)) ? "var(--accent-solid)" : "none"}
                  color={currentTrack && likedTracks.has(String(currentTrack.provider_id)) ? "var(--accent-solid)" : "var(--text-primary)"}
                  onClick={() => toggleLike(currentTrack)}
                  style={{ transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }} 
                  title="Like"
                />
                <Plus 
                  size={22} 
                  cursor={currentTrack ? "pointer" : "default"}
                  onClick={() => currentTrack && setIsPlaylistModalOpenPlayer(true)}
                  style={{ color: 'var(--text-primary)', transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }}
                  title="Add to Playlist"
                />
                {currentTrack && (
                 <Download 
                   size={22} 
                   cursor="pointer" 
                   title={`Download in ${playbackQuality}`} 
                   onClick={handleDownloadPlayer}
                   style={{ color: 'var(--text-primary)', transition: 'color 0.2s' }} 
                 />
                )}
                <button 
                  onClick={() => toggleOverlay('karaoke')}
                  style={{ background: 'transparent', border: 'none', color: isKaraokeOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                  title="Karaoke Mode"
                >
                  <Mic2 size={22} />
                </button>
                <button 
                  onClick={() => toggleOverlay('dj')}
                  style={{ background: 'transparent', border: 'none', color: isDJOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                  title="DJ Tools"
                >
                  <Disc3 size={22} />
                </button>
                <button 
                  onClick={() => toggleOverlay('eq')}
                  style={{ background: 'transparent', border: 'none', color: isEQOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                  title="Target Quality"
                >
                  <Sliders size={22} />
                </button>
                <button 
                  onClick={() => toggleOverlay('queue')}
                  style={{ background: 'transparent', border: 'none', color: isQueueOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                  title="Queue"
                >
                  <ListMusic size={22} />
                </button>
              </div>
           </div>

           <Volume2 size={20} />
           <div 
             style={{ width: '100px', height: '4px', background: 'var(--bg-surface-hover)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
               setVolume(val);
             }}
           >
             <div style={{ width: `${volume * 100}%`, height: '100%', background: 'var(--text-primary)', borderRadius: '2px', transition: 'width 0.1s' }}></div>
           </div>
         </div>
      </div>
      )}
      
      <ToastContainer />
      <DownloadToast />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
    </div>
  );
}

export default App;
