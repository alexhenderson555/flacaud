import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio as RadioIcon, Play, Heart, Loader2, Download } from 'lucide-react';

export default function Radio() {
  const [stationTracks, setStationTracks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const togglePlay = (track) => {
    playerContextTogglePlay(track, stationTracks);
  };

  const generateVibe = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const token = localStorage.getItem('tidal-token');
      let vibeQuery = lang === 'ru' ? "Сыграй отличную музыку, которая сейчас в тренде." : "Play some great music that is trending right now.";
      if (token) {
        const libRes = await fetch('/api/library', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (libRes.ok) {
          const lib = await libRes.json();
          if (lib.length > 0) {
            const shuffled = [...lib].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, 5).map(t => `${t.title}`);
            vibeQuery = lang === 'ru' ? `Мне нравятся эти песни: ${selected.join('; ')}. Сделай радио-микс на основе моего вкуса.` : `I like these songs: ${selected.join('; ')}. Give me a radio mix based on this taste.`;
          }
        }
      }

      const res = await fetch('/api/ai-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: vibeQuery, limit: 15 })
      });
      const data = await res.json();
      
      if (res.ok && data.tracks && data.tracks.length > 0) {
        setStationTracks(data.tracks);
        // Autoplay the first track
        playerContextTogglePlay(data.tracks[0], data.tracks);
      } else {
        setError(lang === 'ru' ? "Не удалось сгенерировать радио-микс." : "Could not generate a radio mix right now.");
      }
    } catch {
      setError(lang === 'ru' ? "Ошибка сети при подключении к радио." : "Network error while tuning into the radio.");
    }
    setIsGenerating(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', marginTop: stationTracks.length > 0 ? '0' : '20vh', transition: 'margin 0.5s ease' }}
      >
        <div style={{ 
          width: '120px', height: '120px', borderRadius: '50%', background: 'var(--accent-gradient)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
          boxShadow: isGenerating || (currentTrackId && stationTracks.some(t => isTrackCurrent(t))) ? '0 0 40px var(--accent-glow)' : '0 10px 30px rgba(0,0,0,0.3)',
          animation: isGenerating ? 'pulse 2s infinite' : 'none'
        }}>
          {isGenerating ? <Loader2 size={48} color="white" className="spin" /> : <RadioIcon size={48} color="white" />}
        </div>
        
        <h1 style={{ fontSize: '3rem', margin: '0 0 16px', background: 'var(--text-gradient)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          My Vibe
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '500px', margin: '0 auto 32px' }}>
          An endless stream of music tailored entirely to your library and tastes.
        </p>

        {!stationTracks.length && (
          <button 
            onClick={generateVibe}
            disabled={isGenerating}
            className="btn-primary"
            style={{ padding: '16px 40px', fontSize: '1.2rem', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '12px', margin: '0 auto' }}
          >
            <Play fill="currentColor" /> {isGenerating ? 'Tuning In...' : 'Start Radio'}
          </button>
        )}
        {error && <div style={{ color: 'var(--error)', marginTop: '16px' }}>{error}</div>}
      </motion.div>

      {stationTracks.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: '800px', marginTop: '40px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Up Next on Your Station</h2>
            <button 
              onClick={generateVibe}
              disabled={isGenerating}
              className="btn-secondary"
              style={{ borderRadius: '20px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RadioIcon size={16} /> Refresh Station
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '40px' }}>
            {stationTracks.map((track, i) => (
              <motion.div 
                key={track.provider_id + i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="search-result glass-panel"
                style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => togglePlay(track)}
              >
                <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden' }}>
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
        </motion.div>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 2s linear infinite; }
      `}} />
    </div>
  );
}
