import React, { useState, useRef, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { useOutletContext, Link } from 'react-router-dom';
import { Search as SearchIcon, Download, Music, Disc, Mic, Play, Pause, Heart, Zap, ImagePlus, Plus, Check } from 'lucide-react';
import { cacheAudioTrack } from '../utils/cache';
import PlaylistModal from '../components/PlaylistModal';
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
    saveAiPlaylist: 'Save Playlist to Library'
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
    saveAiPlaylist: 'Сохранить плейлист'
  }
};

export default function Search() {
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

  useEffect(() => {
    sessionStorage.setItem('tidal_search_query', query);
  }, [query]);

  useEffect(() => {
    sessionStorage.setItem('tidal_search_aiQuery', aiQuery);
  }, [aiQuery]);

  useEffect(() => {
    sessionStorage.setItem('tidal_search_mode', searchMode);
  }, [searchMode]);

  useEffect(() => {
    if (realResults) sessionStorage.setItem('tidal_search_realResults', JSON.stringify(realResults));
  }, [realResults]);

  useEffect(() => {
    if (aiResults) sessionStorage.setItem('tidal_search_aiResults', JSON.stringify(aiResults));
  }, [aiResults]);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const { togglePlay: playerContextTogglePlay, playingTrackId, lang, downloadedTracks, likedTracks, toggleLike: toggleLikeContext } = useOutletContext();
  
  const t = (key) => dict[lang][key] || key;

  const toggleLike = async (track, e) => {
    e.stopPropagation();
    await toggleLikeContext(track);
  };

  const togglePlay = (track, playlistContext = null) => {
    playerContextTogglePlay(track, playlistContext);
  };

  // Mock results fallback if backend fails
  const mockResults = [
    { provider_id: 'mock1', title: 'Starboy', artists: ['The Weeknd', 'Daft Punk'], quality: 'LOSSLESS', cover_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=200', provider: 'tidal' },
    { provider_id: 'mock2', title: 'Midnight City', artists: ['M83'], quality: 'LOSSLESS', cover_url: 'https://images.unsplash.com/photo-1493225457124-a1a2a5f5294b?auto=format&fit=crop&q=80&w=200', provider: 'tidal' },
  ];

  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.trim()) {
        performSearch(query);
      } else {
        setRealResults(null);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [query]);

  const performSearch = async (searchQuery) => {
    setIsSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({ provider: 'tidal', query: searchQuery, limit: 30 })
      });
      const data = await res.json();
      if (data.tracks) setRealResults(data.tracks);
    } catch (err) {
      console.error('Backend search failed, using mock data:', err);
      setRealResults(mockResults);
    }
    setIsSearching(false);
  };

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
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
        cacheAudioTrack(result, 'LOSSLESS').then((success) => {});
        
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

  const handleGenerateAI = async () => {
    if (!aiQuery.trim()) return;
    setIsGenerating(true);
    setAiResults(null);
    try {
      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({ query: aiQuery, imageBase64: aiImageBase64, limit: 10 })
      });
      const data = await res.json();
      if (res.ok && data.tracks) {
        setAiResults(data.tracks);
      } else {
        showToast(`Failed to generate playlist: ${data.detail || 'Unknown error'}`);
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
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
        style={{ marginBottom: '40px', width: '100%', width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
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
        style={{ position: 'relative', width: '100%', width: '100%', maxWidth: '1400px', marginBottom: '40px' }}
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
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{t('results')}</h2>
          {realResults.map((result, idx) => (
            <motion.div 
              key={result.provider_id || idx}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-panel"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '16px', 
                borderRadius: '16px',
                transition: 'background 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
              onClick={() => togglePlay(result, realResults)}
            >
              <img src={result.cover_url || 'https://via.placeholder.com/64'} alt={result.title} style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', marginRight: '20px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>{result.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {result.artists ? result.artists.map((artistName, i) => {
                     const artistId = result.artist_ids?.[i];
                     return (
                       <React.Fragment key={i}>
                         {i > 0 && ", "}
                         {artistId ? (
                           <Link to={`/artist/${artistId}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                             {artistName}
                           </Link>
                         ) : artistName}
                       </React.Fragment>
                     );
                  }) : t('unknownArtist')}
                  {result.year ? ` • ${result.year}` : (result.release_date ? ` • ${result.release_date.split('-')[0]}` : '')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>

                
                <button 
                  onClick={(e) => toggleLike(result, e)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title={likedTracks && likedTracks.has(String(result.provider_id)) ? "Remove from Library" : "Add to Library"}
                >
                  <Heart size={20} fill={likedTracks && likedTracks.has(String(result.provider_id)) ? "var(--accent-solid)" : "none"} color={likedTracks && likedTracks.has(String(result.provider_id)) ? "var(--accent-solid)" : "var(--text-muted)"} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setPlaylistModalTrack(result); }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Add to Playlist"
                >
                  <Plus size={20} color="var(--text-muted)" />
                </button>

                <button 
                  className="btn-secondary" 
                  onClick={(e) => { e.stopPropagation(); togglePlay(result, realResults); }}
                  style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: playingTrackId === result.provider_id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'white' }}
                  title="Play Preview"
                >
                  {playingTrackId === result.provider_id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>

                <button 
                  className="btn-primary" 
                  onClick={(e) => handleDownload(result, e)}
                  style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: downloadedTracks?.has(result.provider_id) ? 0.7 : 1 }}
                  title={downloadedTracks?.has(result.provider_id) ? "Downloaded" : "Download"}
                >
                  {downloadedTracks?.has(result.provider_id) ? <Check size={18} /> : <Download size={18} />}
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* AI Playlist Results */}
      {searchMode === 'ai' && aiResults && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '1400px', width: '100%', marginTop: '40px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{aiQuery} Mix</h2>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 24px', background: 'var(--accent-gradient)' }}>
              <Heart size={16} /> {t('saveAiPlaylist')}
            </button>
          </div>
          
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '24px', overflow: 'hidden' }}>
            {aiResults.map((result, idx) => (
              <motion.div 
                key={result.provider_id || idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="track-card glass-panel"
                style={{ display: 'flex', alignItems: 'center', padding: '16px', margin: 0, borderBottom: '1px solid var(--border-subtle)', borderRadius: 0, cursor: 'pointer' }}
                onClick={() => togglePlay(result, aiResults)}
              >
                <div style={{ width: '32px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {playingTrackId === result.provider_id ? <div className="playing-indicator"><div/><div/><div/></div> : idx + 1}
                </div>
                <img src={result.cover_url} alt={result.title} style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', marginRight: '16px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, color: playingTrackId === result.provider_id ? 'var(--accent-solid)' : 'white' }}>{result.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {result.artists.join(', ')} 
                    {result.release_date && <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>• {result.release_date.split('-')[0]}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>

                  
                  <button 
                    onClick={(e) => toggleLike(result, e)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={likedTracks && likedTracks.has(String(result.provider_id)) ? "Remove from Library" : "Add to Library"}
                  >
                    <Heart size={20} fill={likedTracks && likedTracks.has(String(result.provider_id)) ? "var(--accent-solid)" : "none"} color={likedTracks && likedTracks.has(String(result.provider_id)) ? "var(--accent-solid)" : "var(--text-muted)"} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPlaylistModalTrack(result); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Add to Playlist"
                  >
                    <Plus size={20} color="var(--text-muted)" />
                  </button>

                  <button 
                    className="btn-secondary" 
                    onClick={(e) => { e.stopPropagation(); togglePlay(result); }}
                    style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: playingTrackId === result.provider_id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'white' }}
                    title="Play Preview"
                  >
                    {playingTrackId === result.provider_id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>

                  <button 
                    className="btn-primary" 
                    onClick={(e) => handleDownload(result, e)}
                    style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: downloadedTracks?.has(result.provider_id) ? 0.7 : 1 }}
                    title={downloadedTracks?.has(result.provider_id) ? "Downloaded" : "Download"}
                  >
                    {downloadedTracks?.has(result.provider_id) ? <Check size={18} /> : <Download size={18} />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

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
