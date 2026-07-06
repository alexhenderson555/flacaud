import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio as RadioIcon, Play, Loader2, X, RefreshCcw } from 'lucide-react';
import LibraryTrackRow from '../components/LibraryTrackRow';
import PlaylistModal from '../components/PlaylistModal';
import { useTrackFeaturesForList } from '../hooks/useTrackFeaturesForList';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import { enrichTracksFromApi } from '../utils/libraryApi';
import {
  fetchVibeRadioBatch,
  mergeVibeRadioTracks,
  tagVibeRadioTracks,
  VIBE_RADIO_ORIGIN,
} from '../utils/vibeRadio';

const dict = {
  en: {
    title: 'Genreverse',
    subtitle: 'Explore the universe of genres. Pick a vibe and let the radio play infinitely.',
    start: 'Start Radio',
    tuning: 'Tuning In…',
    upNext: 'Up Next on Your Station',
    refresh: 'Refresh Station',
    errGen: 'Could not generate a radio mix right now.',
    errNet: 'Network error while tuning into the radio.',
    selectGenre: 'Select a Genre',
    back: 'Back to Genres'
  },
  ru: {
    title: 'Genreverse',
    subtitle: 'Исследуйте вселенную жанров. Выберите вайб и слушайте бесконечное радио.',
    start: 'Запустить радио',
    tuning: 'Настраиваем…',
    upNext: 'Дальше на вашей станции',
    refresh: 'Обновить станцию',
    errGen: 'Не удалось сгенерировать радио-микс.',
    errNet: 'Ошибка сети при подключении к радио.',
    selectGenre: 'Выберите Жанр',
    back: 'К списку жанров'
  },
};

export default function Genreverse() {
  const [genreUniverse, setGenreUniverse] = useState([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [stationTracks, setStationTracks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  
  const [activeGenre, setActiveGenre] = useState(null);
  const [currentVibe, setCurrentVibe] = useState(null);

  const {
    togglePlay: playerContextTogglePlay,
    playQueue: playerContextPlayQueue,
    currentTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    djFeaturesActive = false,
    playlist = [],
    t: globalT,
    lang,
    startTrackRadio,
    radioLoadingTrackId,
  } = useOutletContext();

  const t = (k) => dict[lang]?.[k] || dict.en[k];
  const rowT = globalT || ((k) => k);

  const { getFeatures } = useTrackFeaturesForList(stationTracks, {
    analyze: djFeaturesActive,
    enabled: djFeaturesActive,
  });

  useEffect(() => {
    if (!playlist?.length) return;
    if (playlist[0]?.__queue_origin !== VIBE_RADIO_ORIGIN) {
      if (stationTracks.length > 0) setStationTracks([]);
      return;
    }
    
    setStationTracks((prev) => {
      if (prev === playlist) return prev;
      if (prev.length === playlist.length && prev.every((t, i) => String(t.provider_id) === String(playlist[i].provider_id))) {
        return prev;
      }
      return playlist;
    });

    if (playlist[0]?.__queue_genre) {
      setCurrentVibe((prev) => prev !== playlist[0].__queue_genre ? playlist[0].__queue_genre : prev);
    }
  }, [playlist]);

  useEffect(() => {
    let active = true;
    async function fetchGenres() {
      try {
        const data = await apiGetJson('/api/genres');
        if (active && data) {
          const arr = Object.values(data);
          setGenreUniverse(arr);
        }
      } catch (err) {
        console.error("Failed to load genres", err);
      } finally {
        if (active) setLoadingGenres(false);
      }
    }
    fetchGenres();
    return () => { active = false; };
  }, []);

  const togglePlay = (track, list) => {
    playerContextTogglePlay(track, list || stationTracks);
  };

  const generateVibe = async (genreName, refresh = false) => {
    setIsGenerating(true);
    setError(null);
    try {
      const excludeIds = refresh ? [] : stationTracks.map((tr) => String(tr.provider_id));
      const incoming = await fetchVibeRadioBatch({ apiGetJson, lang, excludeIds, genre: genreName });

      if (incoming.length > 0) {
        const withGenre = incoming.map(t => ({...t, __queue_genre: genreName}));
        const enriched = await enrichTracksFromApi(withGenre, lang, { persistLibrary: false });
        const normalized = refresh
          ? tagVibeRadioTracks(enriched)
          : mergeVibeRadioTracks(stationTracks, enriched);
          
        normalized.forEach(tr => { if (!tr.__queue_genre) tr.__queue_genre = genreName; });
        
        setStationTracks(normalized);
        setCurrentVibe(genreName);
        (playerContextPlayQueue || playerContextTogglePlay)(normalized[0], normalized);
      } else {
        setError(t('errGen'));
      }
    } catch (err) {
      setError(messageForApiError(err, lang) || t('errNet'));
    }
    setIsGenerating(false);
  };

  return (
    <div className="page-shell radio-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="radio-hero"
        style={{
          textAlign: 'center',
          marginTop: stationTracks.length > 0 ? 0 : '10vh',
          transition: 'margin 0.5s ease',
          width: '100%',
          maxWidth: '800px',
        }}
      >
        <h1 className="page-header__title" style={{ background: 'var(--text-gradient)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '3rem' }}>
          {t('title')}
        </h1>
        <p className="page-header__subtitle" style={{ maxWidth: '600px', margin: '0 auto 32px', fontSize: '1.2rem' }}>
          {t('subtitle')}
        </p>

        {!stationTracks.length && !activeGenre && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 42vw, 220px), 1fr))',
              gap: '24px', 
              width: '100%',
              paddingBottom: '40px'
            }}
          >
            {loadingGenres ? (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', gridColumn: '1 / -1', padding: '40px' }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--text-secondary)' }} />
              </div>
            ) : genreUniverse.map((g, i) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.03, y: -5 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setActiveGenre(g); setError(null); }}
                data-testid={`genre-card-${g.id}`}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                  background: '#111',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                {/* Base color */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: g.color,
                  opacity: 0.8,
                  filter: 'saturate(1.2)',
                  transition: 'opacity 0.3s ease',
                }} className="genre-card-bg" />

                {/* Image as abstract texture */}
                {g.image && (
                  <div style={{
                    position: 'absolute',
                    inset: '-20px', // Expand to hide blur edges
                    backgroundImage: `url(${g.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(16px) saturate(1.5)',
                    opacity: 0.5,
                    mixBlendMode: 'overlay',
                    transition: 'transform 0.4s ease',
                  }} className="genre-card-img" />
                )}
                
                {/* Gradient overlay for depth */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)',
                }} />

                <div style={{
                  position: 'absolute',
                  bottom: 'clamp(12px, 4vw, 24px)',
                  left: 'clamp(12px, 4vw, 24px)',
                  right: 'clamp(12px, 4vw, 24px)',
                  display: 'flex',
                  alignItems: 'flex-end',
                }}>
                  <span style={{
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: 'clamp(1.05rem, 4.5vw, 1.6rem)',
                    lineHeight: '1.2',
                    letterSpacing: '-0.5px',
                    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    fontFamily: '"Inter", sans-serif'
                  }}>
                    {g.name}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {!stationTracks.length && activeGenre && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: '0 20px' }}>
            <button 
              onClick={() => { setActiveGenre(null); setError(null); }}
              className="btn-secondary"
              style={{ marginBottom: '32px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '30px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <X size={18} /> {t('back')}
            </button>
            
            <motion.div 
              style={{
                background: activeGenre.color,
                borderRadius: '30px',
                padding: '40px',
                marginBottom: '32px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h2 style={{ fontSize: '3rem', margin: '0 0 20px 0', color: ['jazz', 'classical', 'country'].includes(activeGenre.id) ? '#222' : '#fff', textShadow: ['jazz', 'classical', 'country'].includes(activeGenre.id) ? 'none' : '0 2px 10px rgba(0,0,0,0.2)' }}>
                  {activeGenre.name}
                </h2>
                <motion.button
                  data-testid="genreverse-play-mix-btn"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => generateVibe(activeGenre.name)}
                  disabled={isGenerating}
                  style={{
                    background: ['jazz', 'classical', 'country'].includes(activeGenre.id) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid ' + (['jazz', 'classical', 'country'].includes(activeGenre.id) ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.3)'),
                    color: ['jazz', 'classical', 'country'].includes(activeGenre.id) ? '#fff' : '#fff',
                    padding: '16px 32px',
                    borderRadius: '40px',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
                  }}
                >
                  {isGenerating && currentVibe === activeGenre.name ? <Loader2 size={24} className="spin" /> : <Play size={24} fill="currentColor" />}
                  Play {activeGenre.name} Mix
                </motion.button>
              </div>
            </motion.div>

            <h3 style={{ textAlign: 'left', marginBottom: '20px', fontSize: '1.4rem', color: 'var(--text-secondary)' }}>Or select a specific subgenre:</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
              gap: '16px', 
              width: '100%',
              marginTop: '10px'
            }}>
              {(activeGenre.subgenres || []).map((subItem, i) => {
                const sub = typeof subItem === 'string' ? subItem : subItem.name;
                const subImage = typeof subItem === 'object' ? subItem.image : null;
                return (
                <motion.button
                  key={sub}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => generateVibe(sub)}
                  disabled={isGenerating}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-primary)',
                    padding: subImage ? '0' : '24px',
                    borderRadius: '20px',
                    fontSize: '1.2rem',
                    fontWeight: '600',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    position: 'relative',
                    overflow: 'hidden',
                    aspectRatio: subImage ? '1 / 1' : 'auto',
                    minHeight: subImage ? 'auto' : '100px',
                  }}
                >
                  {subImage && (
                    <>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${subImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        transition: 'transform 0.4s ease',
                        opacity: 0.6,
                      }} className="genre-card-img" />
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)',
                      }} />
                    </>
                  )}
                  <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: subImage ? '20px' : '0', width: '100%', height: '100%', justifyContent: subImage ? 'flex-end' : 'center' }}>
                    {isGenerating && currentVibe === sub ? <Loader2 size={28} className="spin" /> : (!subImage && <Play size={28} style={{ opacity: 0.8 }} />)}
                    <span style={{ textAlign: 'center', textShadow: subImage ? '0 2px 10px rgba(0,0,0,0.8)' : 'none' }}>{sub}</span>
                  </div>
                  {/* subtle colored glow based on parent genre */}
                  {!subImage && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-20px',
                    right: '-20px',
                    width: '80px',
                    height: '80px',
                    background: activeGenre.color,
                    filter: 'blur(30px)',
                    opacity: 0.3,
                    borderRadius: '50%',
                    zIndex: 0
                  }} />
                  )}
                </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {error && <div style={{ color: 'var(--error)', marginTop: '24px', fontSize: '1.1rem' }}>{error}</div>}
      </motion.div>

      {stationTracks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: '100%', marginTop: '40px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
            <h2 className="page-header__title" style={{ fontSize: '1.5rem', margin: 0 }}>
              {currentVibe ? `${currentVibe} Radio` : t('upNext')}
            </h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setStationTracks([])}
                className="btn-secondary"
                style={{ borderRadius: '20px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <RadioIcon size={16} />
                Change Vibe
              </button>
              <button
                type="button"
                onClick={() => generateVibe(currentVibe, true)}
                disabled={isGenerating}
                className="btn-secondary"
                style={{ borderRadius: '20px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isGenerating ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
                {t('refresh')}
              </button>
            </div>
          </div>

          <div className="track-list">
            {stationTracks.map((track, i) => (
              <LibraryTrackRow
                key={`${track.provider_id}-${i}`}
                track={track}
                index={i}
                list={stationTracks}
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
                djFeaturesActive={djFeaturesActive}
                getFeatures={getFeatures}
                testIdPrefix="radio"
              />
            ))}
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
