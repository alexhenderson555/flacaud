import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio as RadioIcon, Play, Loader2 } from 'lucide-react';
import LibraryTrackRow from '../components/LibraryTrackRow';
import PlaylistModal from '../components/PlaylistModal';
import { useTrackFeaturesForList } from '../hooks/useTrackFeaturesForList';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import {
  fetchVibeRadioBatch,
  mergeVibeRadioTracks,
  tagVibeRadioTracks,
  VIBE_RADIO_ORIGIN,
} from '../utils/vibeRadio';

const dict = {
  en: {
    title: 'My Vibe',
    subtitle: 'An endless stream tailored to your library and tastes.',
    start: 'Start Radio',
    tuning: 'Tuning In…',
    upNext: 'Up Next on Your Station',
    refresh: 'Refresh Station',
    errGen: 'Could not generate a radio mix right now.',
    errNet: 'Network error while tuning into the radio.',
  },
  ru: {
    title: 'Моя волна',
    subtitle: 'Бесконечный поток под вашу медиатеку и вкус.',
    start: 'Запустить радио',
    tuning: 'Настраиваем…',
    upNext: 'Дальше на вашей станции',
    refresh: 'Обновить станцию',
    errGen: 'Не удалось сгенерировать радио-микс.',
    errNet: 'Ошибка сети при подключении к радио.',
  },
};

export default function Radio() {
  const [stationTracks, setStationTracks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
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
  } = useOutletContext();

  const t = (k) => dict[lang]?.[k] || dict.en[k];
  const rowT = globalT || ((k) => k);

  const { getFeatures } = useTrackFeaturesForList(stationTracks, {
    analyze: djFeaturesActive,
    enabled: djFeaturesActive,
  });

  useEffect(() => {
    if (!playlist?.length || playlist[0]?.__queue_origin !== VIBE_RADIO_ORIGIN) return;
    setStationTracks(playlist);
  }, [playlist]);

  const togglePlay = (track, list) => {
    playerContextTogglePlay(track, list || stationTracks);
  };

  const generateVibe = async ({ refresh = false } = {}) => {
    setIsGenerating(true);
    setError(null);
    try {
      const excludeIds = refresh ? [] : stationTracks.map((tr) => String(tr.provider_id));
      const incoming = await fetchVibeRadioBatch({ apiGetJson, lang, excludeIds });

      if (incoming.length > 0) {
        const normalized = refresh
          ? tagVibeRadioTracks(incoming)
          : mergeVibeRadioTracks(stationTracks, incoming);
        setStationTracks(normalized);
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
          marginTop: stationTracks.length > 0 ? 0 : '20vh',
          transition: 'margin 0.5s ease',
          width: '100%',
          maxWidth: '520px',
        }}
      >
        <h1 className="page-header__title" style={{ background: 'var(--text-gradient)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          {t('title')}
        </h1>
        <p className="page-header__subtitle" style={{ maxWidth: '500px', margin: '0 auto 32px' }}>
          {t('subtitle')}
        </p>

        {!stationTracks.length && (
          <button
            type="button"
            onClick={() => generateVibe()}
            disabled={isGenerating}
            className="btn-primary radio-start-btn"
            style={{ padding: '16px 40px', fontSize: '1.2rem', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '12px', margin: '0 auto' }}
          >
            {isGenerating ? <Loader2 size={22} className="spin" /> : <Play fill="currentColor" size={22} />}
            {isGenerating ? t('tuning') : t('start')}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
            <h2 className="page-header__title" style={{ fontSize: '1.5rem', margin: 0 }}>{t('upNext')}</h2>
            <button
              type="button"
              onClick={() => generateVibe({ refresh: true })}
              disabled={isGenerating}
              className="btn-secondary"
              style={{ borderRadius: '20px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isGenerating ? <Loader2 size={16} className="spin" /> : <RadioIcon size={16} />}
              {t('refresh')}
            </button>
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
