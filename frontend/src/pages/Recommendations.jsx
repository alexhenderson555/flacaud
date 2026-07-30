import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Flame, Play, Loader2 } from 'lucide-react';
import LibraryTrackRow from '../components/LibraryTrackRow';
import VirtualTrackList from '../components/VirtualTrackList';
import PlaylistModal from '../components/PlaylistModal';
import { useTrackFeaturesForList } from '../hooks/useTrackFeaturesForList';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import { normalizeTrack } from '../utils/trackNormalize';
import { filterRecommendations, rankRecommendations } from '../utils/listeningSignals';

/** Client-side implicit-feedback rerank — skip/completion history isn't known
 * server-side, so this runs after every fetch rather than in the API call. */
function applyListeningSignals(tracks) {
  return rankRecommendations(filterRecommendations(tracks));
}

const PAGE_SIZE = 20;

function mergeTracks(existing, incoming) {
  const ids = new Set(existing.map((t) => String(t.provider_id)));
  const fresh = incoming.filter((t) => !ids.has(String(t.provider_id)));
  return fresh.length ? [...existing, ...fresh] : existing;
}

export default function Recommendations() {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);

  const {
    togglePlay,
    playQueue,
    currentTrackId,
    isPlaying,
    isLoading: trackLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    djFeaturesActive = false,
    lang,
    t: globalT,
    startTrackRadio,
    radioLoadingTrackId,
  } = useOutletContext();

  const rowT = globalT || ((k) => k);
  const { getFeatures } = useTrackFeaturesForList(tracks, {
    analyze: djFeaturesActive,
    enabled: djFeaturesActive,
  });

  const loadInitial = useCallback(async ({ refresh = false } = {}) => {
    setIsLoading(true);
    setError(null);
    setHasMore(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (refresh) params.set('refresh', '1');
      const data = await apiGetJson(
        `/api/recommendations?${params}`,
        { auth: true, lang, timeoutMs: 60_000, retries: 2 },
      );
      if (data.tracks?.length > 0) {
        const mapped = applyListeningSignals(data.tracks.map((tr) => normalizeTrack(tr)).filter(Boolean));
        setTracks(mapped);
        setHasMore(mapped.length >= PAGE_SIZE);
      } else {
        setTracks([]);
        setError(lang === 'ru' ? 'Не удалось загрузить рекомендации.' : 'Could not load recommendations.');
      }
    } catch (err) {
      setError(messageForApiError(err, lang));
    }
    setIsLoading(false);
  }, [lang]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || tracks.length === 0) return;
    setIsLoadingMore(true);
    try {
      const exclude = tracks.map((t) => String(t.provider_id)).join(',');
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        refresh: '1',
        exclude,
      });
      const data = await apiGetJson(`/api/recommendations?${params}`, { auth: true, lang });
      const incoming = applyListeningSignals((data.tracks || []).map((tr) => normalizeTrack(tr)).filter(Boolean));
      if (!incoming.length) {
        setHasMore(false);
        return;
      }
      const merged = mergeTracks(tracks, incoming);
      setTracks(merged);
      if (merged.length === tracks.length || incoming.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      setError(messageForApiError(err, lang));
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, lang, tracks]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const playAll = () => {
    if (!tracks.length) return;
    if (playQueue) playQueue(tracks[0], tracks);
    else togglePlay(tracks[0], tracks);
  };

  const handleRowPlay = (track, list) => {
    togglePlay(track, list || tracks);
  };

  return (
    <div className="page-shell">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: '32px',
      }}
      >
        <div>
          <h1 style={{
            fontSize: '2.5rem',
            margin: '0 0 8px',
            background: 'var(--text-gradient)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
          >
            <Flame size={32} color="var(--accent-solid)" />
            {lang === 'ru' ? 'Рекомендации' : 'Recommendations'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1.1rem' }}>
            {lang === 'ru'
              ? 'По вашей медиатеке: radio, похожие треки и артисты в том же стиле'
              : 'From your library: track radio, similar tracks, and related artists'}
          </p>
        </div>
        {tracks.length > 0 && (
          <button
            type="button"
            onClick={playAll}
            className="btn-primary"
            style={{
              padding: '12px 24px',
              borderRadius: '30px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <Play fill="currentColor" size={20} />
            {lang === 'ru' ? 'Слушать все' : 'Play All'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '100px',
          color: 'var(--text-muted)',
        }}
        >
          <Loader2 size={48} className="spin" style={{ marginBottom: '16px', color: 'var(--accent-solid)' }} />
          <p>{lang === 'ru' ? 'Подбираем лучшую музыку...' : 'Curating the best music for you...'}</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--error)' }}>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadInitial({ refresh: true })}
            className="btn-secondary"
            style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '20px' }}
          >
            {lang === 'ru' ? 'Попробовать снова' : 'Try Again'}
          </button>
        </div>
      ) : (
        <>
          <VirtualTrackList
            className="track-list"
            items={tracks}
            renderItem={(track, index) => (
              <LibraryTrackRow
                key={`${track.provider_id}-${index}`}
                track={track}
                index={index}
                list={tracks}
                t={rowT}
                likedTracks={likedTracks}
                downloadedTracks={downloadedTracks}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                isLoading={trackLoading}
                onTogglePlay={handleRowPlay}
                onToggleLike={toggleLike}
                onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
                onDownload={handleDownload}
                onStartRadio={startTrackRadio}
                radioLoadingTrackId={radioLoadingTrackId}
                djFeaturesActive={djFeaturesActive}
                getFeatures={getFeatures}
                testIdPrefix="recommendations"
              />
            )}
          />
          {(hasMore || isLoadingMore) && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="btn-secondary"
                style={{ borderRadius: '20px', padding: '10px 24px', minWidth: '160px' }}
                data-testid="recommendations-load-more"
              >
                {isLoadingMore
                  ? (lang === 'ru' ? 'Подбираем…' : 'Loading…')
                  : (lang === 'ru' ? 'Ещё' : 'Load more')}
              </button>
            </div>
          )}
        </>
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
