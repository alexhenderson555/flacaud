import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { debounce } from '../utils/debounce';
import { showToast } from '../utils/toast';
import { useOutletContext } from 'react-router-dom';
import { Search as SearchIcon, Mic, Heart, Zap, ImagePlus, Plus } from 'lucide-react';
import { cacheAudioTrack } from '../utils/cache';
import PlaylistModal from '../components/PlaylistModal';
import LibraryTrackRow from '../components/LibraryTrackRow';
import VirtualTrackList from '../components/VirtualTrackList';
import { suggestSearchCorrection, fixKeyboardLayout } from '../utils/searchQueryFix';
import { tracksForPlaylistApi } from '../utils/playlistApi';
import { getAccessToken } from '../utils/tokenStorage';
import { motion, AnimatePresence } from 'framer-motion';

const dict = {
  en: {
    findLossless: 'Find',
    findLosslessBold: 'Lossless',
    findDesc: 'Search for tracks, albums or playlists across all supported platforms. Get pure FLAC quality instantly.',
    placeholder: 'Search by title, artist, or paste a URL...',
    btnSearch: 'Search',
    btnSearching: 'Searching...',
    audioRec: 'or use Audio Recognition',
    listening: 'Listening to audio...',
    results: 'Results',
    unknownArtist: 'Unknown Artist',
    aiMode: 'AI Playlist',
    normalMode: 'Standard Search',
    aiPlaceholder: 'Describe the vibe... (e.g., late night coding in Tokyo)',
    btnGenerate: 'Generate Playlist',
    btnGenerating: 'Generating...',
    genMore: 'Generate 10 More',
    aiDesc: 'Let AI curate the perfect 10-track playlist based on your mood or prompt.',
    saveAiPlaylist: 'Save Playlist to Library',
    saveSearchPlaylist: 'Save results as playlist',
    loadMore: 'Load more',
    didYouMean: 'Did you mean',
    searching: 'Searching…',
  },
  ru: {
    findLossless: 'Найти',
    findLosslessBold: 'Lossless',
    findDesc: 'Ищите треки, альбомы или плейлисты на всех платформах. Получайте чистый FLAC моментально.',
    placeholder: 'Поиск по названию, артисту или ссылке...',
    btnSearch: 'Найти',
    btnSearching: 'Ищем...',
    audioRec: 'или используйте распознавание звука',
    listening: 'Слушаю аудио...',
    results: 'Результаты',
    unknownArtist: 'Неизвестный исполнитель',
    aiMode: 'ИИ Плейлист',
    normalMode: 'Обычный поиск',
    aiPlaceholder: 'Опишите вайб... (например, ночной кодинг в Токио)',
    btnGenerate: 'Сгенерировать',
    btnGenerating: 'Генерация...',
    aiDesc: 'ИИ соберет идеальный плейлист из 10 треков по вашему описанию.',
    saveAiPlaylist: 'Сохранить плейлист',
    saveSearchPlaylist: 'Сохранить результаты в плейлист',
    loadMore: 'Ещё',
    didYouMean: 'Возможно, вы имели в виду',
    searching: 'Поиск…',
  }
};

function Search() {
  const [query, setQuery] = useState(() => sessionStorage.getItem('tidal_search_query') || '');
  const [aiQuery, setAiQuery] = useState(() => sessionStorage.getItem('tidal_search_aiQuery') || '');
  const [aiImageBase64, setAiImageBase64] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [realResults, setRealResults] = useState(() => {
    const saved = sessionStorage.getItem('tidal_search_realResults');
    return saved ? JSON.parse(saved) : null;
  });
  const [aiResults, setAiResults] = useState(() => {
    const saved = sessionStorage.getItem('tidal_search_aiResults');
    return saved ? JSON.parse(saved) : null;
  });
  const [searchMode, setSearchMode] = useState(() => sessionStorage.getItem('tidal_search_mode') || 'normal');
  const [hasMore, setHasMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [querySuggestion, setQuerySuggestion] = useState(null);
  const loadMoreRef = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const searchOffsetRef = useRef(searchOffset);
  const isSearchingRef = useRef(isSearching);
  const queryRef = useRef(query);
  const loadingMoreRef = useRef(false);
  const PAGE_SIZE = 50;

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { searchOffsetRef.current = searchOffset; }, [searchOffset]);
  useEffect(() => { isSearchingRef.current = isSearching; }, [isSearching]);
  useEffect(() => { queryRef.current = query; }, [query]);

  const persistSearchState = useMemo(() => debounce((patch) => {
    try {
      if ('query' in patch) sessionStorage.setItem('tidal_search_query', patch.query);
      if ('aiQuery' in patch) sessionStorage.setItem('tidal_search_aiQuery', patch.aiQuery);
      if ('searchMode' in patch) sessionStorage.setItem('tidal_search_mode', patch.searchMode);
      if ('realResults' in patch) {
        if (patch.realResults) sessionStorage.setItem('tidal_search_realResults', JSON.stringify(patch.realResults));
        else sessionStorage.removeItem('tidal_search_realResults');
      }
      if ('aiResults' in patch) {
        if (patch.aiResults) sessionStorage.setItem('tidal_search_aiResults', JSON.stringify(patch.aiResults));
        else sessionStorage.removeItem('tidal_search_aiResults');
      }
    } catch {
      /* quota */
    }
  }, 300), []);

  useEffect(() => { persistSearchState({ query }); }, [query, persistSearchState]);
  useEffect(() => { persistSearchState({ aiQuery }); }, [aiQuery, persistSearchState]);
  useEffect(() => { persistSearchState({ searchMode }); }, [searchMode, persistSearchState]);
  useEffect(() => { persistSearchState({ realResults }); }, [realResults, persistSearchState]);
  useEffect(() => { persistSearchState({ aiResults }); }, [aiResults, persistSearchState]);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const { togglePlay: playerContextTogglePlay, currentTrackId, isPlaying, isLoading, lang, downloadedTracks, likedTracks, toggleLike: toggleLikeContext, startTrackRadio, radioLoadingTrackId, t: globalT } = useOutletContext();
  
  const t = (key) => dict[lang][key] || key;
  const rowT = globalT || ((k) => k);

  const toggleLike = async (track, e) => {
    e.stopPropagation();
    await toggleLikeContext(track);
  };

  const togglePlay = (track, playlistContext = null) => {
    playerContextTogglePlay(track, playlistContext);
  };

  const getAuthToken = () => getAccessToken() || '';

  const saveTracksAsPlaylist = async (tracks, name) => {
    const token = getAuthToken();
    if (!tracks?.length || !token) {
      showToast(lang === 'ru' ? 'Войдите, чтобы сохранить плейлист' : 'Sign in to save playlist');
      return;
    }
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const created = await res.json();
    if (!res.ok) throw new Error(created.detail || 'Failed to create playlist');
    const update = await fetch(`/api/playlists/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tracks: tracksForPlaylistApi(tracks) }),
    });
    if (!update.ok) {
      const err = await update.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to save tracks');
    }
    showToast(lang === 'ru' ? 'Плейлист сохранён' : 'Playlist saved');
  };

  const saveSearchResultsAsPlaylist = async () => {
    const trimmed = query.trim();
    const name = trimmed
      ? (lang === 'ru' ? `Поиск: ${trimmed}` : `Search: ${trimmed}`)
      : (lang === 'ru' ? 'Результаты поиска' : 'Search results');
    try {
      await saveTracksAsPlaylist(realResults, name);
    } catch (err) {
      showToast(err.message || (lang === 'ru' ? 'Не удалось сохранить' : 'Save failed'));
    }
  };

  const saveAiResultsAsPlaylist = async () => {
    const trimmed = aiQuery.trim();
    const name = trimmed ? `${trimmed} Mix` : (lang === 'ru' ? 'ИИ микс' : 'AI Mix');
    try {
      await saveTracksAsPlaylist(aiResults, name);
    } catch (err) {
      showToast(err.message || (lang === 'ru' ? 'Не удалось сохранить' : 'Save failed'));
    }
  };

  const performSearch = useCallback(async (searchQuery, offset = 0, append = false) => {
    setIsSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body: JSON.stringify({ provider: 'tidal', query: searchQuery, limit: PAGE_SIZE, offset })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody.detail || res.statusText;
        throw new Error(typeof detail === 'string' ? detail : 'Search failed');
      }
      const data = await res.json();
      if (data.tracks) {
        setRealResults((prev) => (append && prev ? [...prev, ...data.tracks] : data.tracks));
        setHasMore(Boolean(data.has_more));
        setSearchOffset(offset + data.tracks.length);
        if (!append) {
          if (data.tracks.length > 0) {
            setQuerySuggestion(null);
          } else {
            setQuerySuggestion(suggestSearchCorrection(searchQuery));
          }
        }
        if (!append && data.tracks.length === 0) {
          const alt = fixKeyboardLayout(searchQuery);
          if (alt !== searchQuery) {
            const altRes = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
              body: JSON.stringify({ provider: 'tidal', query: alt, limit: PAGE_SIZE, offset: 0 })
            });
            const altData = altRes.ok ? await altRes.json() : null;
            if (altData?.tracks?.length) {
              setRealResults(altData.tracks);
              setHasMore(Boolean(altData.has_more));
              setSearchOffset(altData.tracks.length);
              setQuery(alt);
              setQuerySuggestion(null);
            }
          }
        }
      }
    } catch (err) {
      console.error('Search failed:', err);
      if (!append) {
        setRealResults([]);
        const msg = lang === 'ru'
          ? (err.message?.includes('expired') || err.message?.includes('Session')
            ? 'Сессия истекла — войдите в аккаунт'
            : 'Поиск недоступен. Проверьте вход или обновите страницу (Ctrl+Shift+R)')
          : (err.message?.includes('expired') || err.message?.includes('Session')
            ? 'Session expired — open Account and log in'
            : 'Search unavailable. Log in or hard-refresh (Ctrl+Shift+R)');
        showToast(msg);
      }
    }
    setIsSearching(false);
  }, [lang]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.trim()) {
        performSearch(query.trim(), 0, false);
      } else {
        setRealResults(null);
        setHasMore(false);
        setSearchOffset(0);
        setQuerySuggestion(null);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [query, performSearch]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    const el = loadMoreRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMoreRef.current || isSearchingRef.current || loadingMoreRef.current) return;
        const q = queryRef.current.trim();
        if (!q) return;
        loadingMoreRef.current = true;
        performSearch(q, searchOffsetRef.current, true).finally(() => {
          loadingMoreRef.current = false;
        });
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, performSearch]);

  const handleListen = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsListening(true);
      
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsSearching(true);
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        
        try {
          const res = await fetch('/api/recognize', {
            method: 'POST',
            body: formData
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.tracks && data.tracks.length > 0) {
              const primaryArtist = data.tracks[0].artists?.[0] || 'Unknown';
              setQuery(`${primaryArtist} - ${data.tracks[0].title}`);
              setRealResults(data.tracks);
            } else {
              showToast('Song not recognized');
            }
          } else {
            showToast('Recognition failed (Backend error)');
          }
        } catch (err) {
          console.error('Backend fetch failed:', err);
          showToast('Backend not running');
        } finally {
          setTimeout(() => setIsSearching(false), 800);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      
      // Record for 10 seconds then stop and send
      setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }, 10000);

    } catch (err) {
      console.error('Microphone access denied:', err);
      showToast('Microphone access is required for Audio Recognition.');
    }
  };

  const handleDownload = async (result, e) => {
    e.stopPropagation();
    const url = result.source_url || (result.id === 2 ? 'https://tidal.com/browse/track/mock' : null);
    if (!url) {
      showToast("No source URL available for this track.");
      return;
    }
    
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body: JSON.stringify({
          url: url,
          quality: 'LOSSLESS',
          lyrics: true,
          karaoke: false,
          dj_analyze: false
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        // Start caching the file in browser storage for offline playback
        cacheAudioTrack(result, 'LOSSLESS').then(() => {});
        
        // Save job_id to queue
        const saved = localStorage.getItem('tidal-queue-jobs');
        const jobs = saved ? JSON.parse(saved) : [];
        jobs.push(data.job_id);
        localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
      } else {
        showToast(`Failed to start download:\n${data.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to connect to backend for downloading.');
    }
  };

  const renderSearchTrackRow = (track, index, list, testIdPrefix = 'search') => (
    <LibraryTrackRow
      key={`${track.provider_id}-${index}`}
      track={track}
      index={index}
      list={list}
      t={rowT}
      likedTracks={likedTracks}
      downloadedTracks={downloadedTracks}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      isLoading={isLoading}
      onTogglePlay={togglePlay}
      onToggleLike={toggleLike}
      onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
      onDownload={handleDownload}
      onStartRadio={startTrackRadio}
      radioLoadingTrackId={radioLoadingTrackId}
      testIdPrefix={testIdPrefix}
    />
  );

  const handleGenerateAI = async () => {
    if (!aiQuery.trim()) return;
    setIsGenerating(true);
    setAiResults(null);
    try {
      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body: JSON.stringify({ query: aiQuery, imageBase64: aiImageBase64, limit: 10 })
      });
      const data = await res.json();
      if (res.ok && data.tracks?.length) {
        setAiResults(data.tracks);
      } else {
        showToast(`Failed to generate playlist: ${data.detail || 'No tracks found'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Network error while generating playlist.');
    }
    setIsGenerating(false);
  };

  const handleGenerateMore = async () => {
    if (!aiQuery.trim() || !aiResults) return;
    setIsGenerating(true);
    try {
      const existingTitles = aiResults.map(t => t.title).join(', ');
      // We send a request asking for more tracks, avoiding the ones we already have
      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` },
        body: JSON.stringify({ 
          query: aiQuery + ` (Do NOT include these: ${existingTitles})`, 
          limit: 10 
        })
      });
      const data = await res.json();
      if (res.ok && data.tracks) {
        // Append new tracks to the existing results
        setAiResults(prev => [...prev, ...data.tracks]);
      } else {
        showToast(`Failed to generate more: ${data.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Network error while generating more tracks.');
    }
    setIsGenerating(false);
  };

  return (
    <div style={{ paddingBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{ marginBottom: '40px', width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', background: 'var(--bg-surface-hover)', borderRadius: '16px', padding: '6px', marginBottom: '32px' }}>
          <button 
            onClick={() => setSearchMode('normal')}
            style={{ padding: '8px 24px', borderRadius: '12px', border: 'none', background: searchMode === 'normal' ? 'var(--accent-solid)' : 'transparent', color: searchMode === 'normal' ? 'white' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            {t('normalMode')}
          </button>
          <button 
            onClick={() => setSearchMode('ai')}
            style={{ padding: '8px 24px', borderRadius: '12px', border: 'none', background: searchMode === 'ai' ? 'var(--accent-gradient)' : 'transparent', color: searchMode === 'ai' ? 'white' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Zap size={16} fill="currentColor" /> {t('aiMode')}
          </button>
        </div>

        {searchMode === 'normal' ? (
          <>
            <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
              {t('findLossless')} <span className="text-gradient">{t('findLosslessBold')}</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px' }}>
              {t('findDesc')}
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
              AI <span style={{ background: 'linear-gradient(90deg, #ff00cc, #3333ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Playlist Maker</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px' }}>
              {t('aiDesc')}
            </p>
          </>
        )}
      </motion.div>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        style={{ position: 'relative', width: '100%', maxWidth: '1400px', marginBottom: '40px' }}
      >
        {searchMode === 'normal' ? (
          <form className="glass-panel" onSubmit={(e) => { e.preventDefault(); performSearch(query); }} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', width: '100%' }}>
            <SearchIcon size={24} color="var(--text-muted)" style={{ marginRight: '16px' }} />
            <input 
              type="text" 
              placeholder={t('placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ 
                flex: 1, 
                background: 'transparent', 
                border: 'none', 
                color: 'var(--text-primary)', 
                fontSize: '1.2rem',
                padding: '12px 0'
              }}
            />
            <button type="submit" className="btn-primary" style={{ borderRadius: '16px', padding: '12px 32px' }}>
              {isSearching ? t('btnSearching') : t('btnSearch')}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleGenerateAI(); }} style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', width: '100%' }}>
              <Zap size={24} color="#ff00cc" style={{ marginRight: '16px' }} />
              
              {aiImageBase64 && (
                <div style={{ position: 'relative', width: '40px', height: '40px', marginRight: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                  <img src={aiImageBase64} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setAiImageBase64(null)} style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', padding: '2px', cursor: 'pointer', borderRadius: '0 0 0 4px', fontSize: '10px' }}>✕</button>
                </div>
              )}

              <input 
                type="text" 
                placeholder={aiImageBase64 ? "Now describe what you want..." : t('aiPlaceholder')}
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                style={{ 
                  flex: 1, 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--text-primary)', 
                  fontSize: '1.2rem',
                  padding: '12px 0'
                }}
              />
              
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px' }}>
                <ImagePlus size={24} color="var(--text-muted)" />
                <input 
                  type="file" 
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setAiImageBase64(reader.result);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ borderRadius: '16px', padding: '16px 32px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(90deg, #ff00cc, #3333ff)', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', alignSelf: 'center', minWidth: '250px' }} 
            >
              {isGenerating ? t('btnGenerating') : t('btnGenerate')}
            </button>
          </form>
        )}

        {/* Shazam Audio Recognition */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '0.9rem' }}>{t('audioRec')}</span>
            <motion.button 
              type="button"
              onClick={handleListen}
              animate={isListening ? { scale: [1, 1.1, 1], boxShadow: ['0 0 0px var(--accent-glow)', '0 0 20px var(--accent-glow)', '0 0 0px var(--accent-glow)'] } : {}}
              transition={{ repeat: isListening ? Infinity : 0, duration: 1.5 }}
              style={{ 
                width: '56px', height: '56px', borderRadius: '50%', 
                background: isListening ? 'var(--accent-gradient)' : 'var(--bg-surface)', 
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isListening ? 'white' : 'var(--text-primary)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                cursor: 'pointer'
              }}
            >
              <Mic size={24} />
            </motion.button>
            <AnimatePresence>
              {isListening && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  exit={{ opacity: 0, x: 10 }}
                  style={{ color: 'var(--accent-solid)', fontWeight: 500 }}
                >
                  {t('listening')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {query && !isSearching && !isListening && realResults && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '1400px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 0 }}>{t('results')}</h2>
            {realResults.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                data-testid="save-search-playlist-btn"
                onClick={saveSearchResultsAsPlaylist}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 16px' }}
              >
                <Plus size={16} aria-hidden />
                {t('saveSearchPlaylist')}
              </button>
            )}
          </div>
          {querySuggestion && (
            <button
              type="button"
              onClick={() => setQuery(querySuggestion)}
              style={{ alignSelf: 'flex-start', background: 'rgba(37,117,252,0.12)', border: '1px solid rgba(37,117,252,0.3)', color: 'var(--accent-solid)', borderRadius: '12px', padding: '8px 14px', cursor: 'pointer', marginBottom: '8px', fontSize: '0.9rem' }}
            >
              {t('didYouMean')}: <strong>{querySuggestion}</strong>?
            </button>
          )}
          <VirtualTrackList
            className="track-list"
            items={realResults}
            renderItem={(result, idx) => {
              const list = realResults.map((t) => ({ ...t, __queue_origin: 'search' }));
              return renderSearchTrackRow(result, idx, list);
            }}
          />
          {(hasMore || isSearching) && (
            <div ref={loadMoreRef} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {isSearching ? t('searching') : t('loadMore')}
            </div>
          )}
        </motion.div>
      )}

      {/* AI Playlist Results */}
      {searchMode === 'ai' && aiResults && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '1400px', marginTop: '40px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{aiQuery} Mix</h2>
            <button
              type="button"
              className="btn-primary"
              onClick={saveAiResultsAsPlaylist}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 24px', background: 'var(--accent-gradient)' }}
            >
              <Heart size={16} /> {t('saveAiPlaylist')}
            </button>
          </div>
          
          <VirtualTrackList
            className="track-list track-list--ai-panel"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '24px',
              overflow: 'hidden',
            }}
            items={aiResults}
            renderItem={(result, idx) => renderSearchTrackRow(result, idx, aiResults, 'ai-search')}
          />

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button 
              onClick={handleGenerateMore}
              disabled={isGenerating}
              className="btn-secondary" 
              style={{ padding: '12px 32px', borderRadius: '24px', fontSize: '1.1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', cursor: isGenerating ? 'not-allowed' : 'pointer' }}
            >
              <Zap size={18} color="var(--accent-solid)" />
              {isGenerating ? t('btnGenerating') : t('genMore')}
            </button>
          </div>
        </motion.div>
      )}

      {playlistModalTrack && (
        <PlaylistModal 
          track={playlistModalTrack} 
          onClose={() => setPlaylistModalTrack(null)} 
        />
      )}
    </div>
  );
}

export default memo(Search);
