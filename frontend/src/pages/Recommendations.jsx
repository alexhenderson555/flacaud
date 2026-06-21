import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Play, Heart, Download, Loader2 } from 'lucide-react';
import { apiGetJson, messageForApiError } from '../utils/apiClient';

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
    lang,
  } = useOutletContext();

  const isTrackCurrent = (track) => currentTrackId === String(track.provider_id);

  const fetchRecommendations = useCallback(async ({ refresh = false } = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (refresh) params.set('refresh', '1');
      const data = await apiGetJson(`/api/recommendations?${params}`, {
        auth: true,
        lang,
        timeoutMs: 60_000,
        retries: 2,
      });

      if (data.tracks?.length > 0) {
        setRecommendedTracks(data.tracks);
      } else {
        setRecommendedTracks([]);
        setError(lang === 'ru' ? 'Не удалось загрузить рекомендации.' : 'Could not load recommendations.');
      }
    } catch (err) {
      setError(messageForApiError(err, lang));
    }
    setIsLoading(false);
  }, [lang]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

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
            {lang === 'ru' ? 'Подборка на основе вашей медиатеки и актуальных хитов' : 'Based on your library and current hits'}
          </p>
        </div>
        {recommendedTracks.length > 0 && (
          <button
            type="button"
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
          <button
            type="button"
            onClick={() => fetchRecommendations({ refresh: true })}
            className="btn-secondary"
            style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '20px' }}
          >
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
                    <div className="playing-indicator"><div /><div /><div /></div>
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
                <button type="button" onClick={(e) => toggleLike(track, e)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Heart size={20} color={likedTracks.has(String(track.provider_id)) ? 'var(--accent-solid)' : 'var(--text-muted)'} fill={likedTracks.has(String(track.provider_id)) ? 'var(--accent-solid)' : 'none'} />
                </button>

                <button type="button" className="btn-primary" onClick={(e) => handleDownload(track, e)} style={{ padding: '8px', borderRadius: '50%' }}>
                  <Download size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 2s linear infinite; }
      ` }} />
    </div>
  );
}
