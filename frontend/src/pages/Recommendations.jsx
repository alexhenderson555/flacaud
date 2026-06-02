import React, { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Play, Heart, Download, Disc, Loader2 } from 'lucide-react';

export default function Recommendations() {
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { 
    togglePlay: playerContextTogglePlay, 
    currentTrackId,
    isPlaying,
    likedTracks,
    toggleLike,
    handleDownload,
    lang
  } = useOutletContext();

  const isTrackCurrent = (track) => currentTrackId === String(track.provider_id);

  useEffect(() => {
    fetchRecommendations();
  }, [lang]);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('tidal-token');
      let vibeQuery = lang === 'ru' ? "Что сейчас в тренде и популярно" : "Trending hits and popular music right now";
      
      if (token) {
        const libRes = await fetch('/api/library', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (libRes.ok) {
          const lib = await libRes.json();
          if (lib.length > 0) {
            const shuffled = [...lib].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, 3).map(t => `${t.title} by ${t.artists?.[0] || 'Unknown'}`);
            vibeQuery = lang === 'ru' 
              ? `Порекомендуй отличные треки, похожие на: ${selected.join('; ')}.` 
              : `Recommend me great tracks similar to: ${selected.join('; ')}.`;
          }
        }
      }

      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: vibeQuery, limit: 20 })
      });
      const data = await res.json();
      
      if (res.ok && data.tracks && data.tracks.length > 0) {
        setRecommendedTracks(data.tracks);
      } else {
        setError(lang === 'ru' ? "Не удалось загрузить рекомендации." : "Could not load recommendations.");
      }
    } catch (err) {
      setError(lang === 'ru' ? "Ошибка сети при получении рекомендаций." : "Network error fetching recommendations.");
    }
    setIsLoading(false);
  };

  const playAll = () => {
    if (recommendedTracks.length > 0) {
      playerContextTogglePlay(recommendedTracks[0], recommendedTracks);
    }
  };

  return (
    <div style={{ padding: '24px 40px', paddingBottom: '120px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 8px', background: 'var(--text-gradient)', WebkitBackgroundClip: 'text', color: 'transparent', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Flame size={32} color="var(--accent-solid)" />
            {lang === 'ru' ? 'Рекомендации' : 'Recommendations'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1.1rem' }}>
            {lang === 'ru' ? 'Специально подобранные треки для вас' : 'Specially curated tracks for you'}
          </p>
        </div>
        {recommendedTracks.length > 0 && (
          <button 
            onClick={playAll}
            className="btn-primary" 
            style={{ padding: '12px 24px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
          >
            <Play fill="currentColor" size={20} />
            {lang === 'ru' ? 'Слушать все' : 'Play All'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px', color: 'var(--text-muted)' }}>
          <Loader2 size={48} className="spin" style={{ marginBottom: '16px', color: 'var(--accent-solid)' }} />
          <p>{lang === 'ru' ? 'Подбираем лучшую музыку...' : 'Curating the best music for you...'}</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--error)' }}>
          <p>{error}</p>
          <button onClick={fetchRecommendations} className="btn-secondary" style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '20px' }}>
            {lang === 'ru' ? 'Попробовать снова' : 'Try Again'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {recommendedTracks.map((track, i) => (
            <motion.div 
              key={track.provider_id + i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="search-result glass-panel"
              style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => playerContextTogglePlay(track, recommendedTracks)}
            >
              <div style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden' }}>
                <img src={track.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {isTrackCurrent(track) && isPlaying && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="playing-indicator"><div/><div/><div/></div>
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: isTrackCurrent(track) ? 'var(--accent-solid)' : 'white', marginBottom: '4px' }}>
                  {track.title}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {track.artists ? track.artists.join(', ') : 'Unknown Artist'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-solid)', fontSize: '0.85rem', fontWeight: 600, background: 'rgba(37, 117, 252, 0.1)', padding: '6px 12px', borderRadius: '12px' }}>
                  <Disc size={14} />
                  {track.quality || 'LOSSLESS'}
                </div>
                
                <button onClick={(e) => toggleLike(track, e)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Heart size={20} color={likedTracks.has(String(track.provider_id)) ? "var(--accent-solid)" : "var(--text-muted)"} fill={likedTracks.has(String(track.provider_id)) ? "var(--accent-solid)" : "none"} />
                </button>

                <button className="btn-primary" onClick={(e) => handleDownload(track, e)} style={{ padding: '8px', borderRadius: '50%' }}>
                  <Download size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 2s linear infinite; }
      `}} />
    </div>
  );
}
