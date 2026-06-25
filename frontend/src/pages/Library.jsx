import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Play,
  Shuffle,
  Trash2,
  ListMusic,
  Plus,
  ChevronLeft,
  Search,
  Share2,
  Disc,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { messageForApiError } from '../utils/apiClient';
import GlassDropdown from '../components/GlassDropdown';
import DjFiltersPanel from '../components/DjFiltersPanel';
import PlaylistCard from '../components/PlaylistCard';
import PlaylistTrackList from '../components/PlaylistTrackList';
import VirtualTrackList from '../components/VirtualTrackList';
import PlaylistModal from '../components/PlaylistModal';
import TrackRow from '../components/TrackRow';
import TrackRowActions from '../components/TrackRowActions';
import TrackDjMeta from '../components/TrackDjMeta';
import { useLibraryDataContext } from '../context/LibraryDataContext';
import { useTrackFeaturesForList } from '../hooks/useTrackFeaturesForList';
import { librarySortCompare, playlistIdsMatch } from '../utils/libraryApi';
import { normalizeTrack } from '../utils/trackNormalize';
import { readRecentlyPlayed } from '../utils/recentlyPlayed';
import { formatTrackCountAndDuration, sumTrackDurations } from '../utils/trackDuration';
import { startDownloadJob } from '../utils/downloadJobs';
import { createPlaylistShareLink, shareUrlFromToken } from '../utils/shareApi';
import { dispatchLibraryReloadRequest } from '../utils/libraryPatch';
import { hasAuthSession } from '../utils/hasAuthSession';

const BPM_MIN = 60;
const BPM_MAX = 200;

function isBpmFilterActive(range) {
  if (!range) return false;
  return range.min > BPM_MIN || range.max < BPM_MAX;
}

function trackPassesDjFilters(features, { filterKey, bpmRange, isBpmActive }) {
  const bpmOn = isBpmActive ?? isBpmFilterActive(bpmRange);
  if (filterKey && features?.camelotKey && features.camelotKey !== filterKey) return false;
  if (bpmOn && features?.bpm != null && (features.bpm < bpmRange.min || features.bpm > bpmRange.max)) {
    return false;
  }
  return true;
}

function sortOptions(t) {
  return [
    { value: 'newest', label: t('libSortNewest') },
    { value: 'oldest', label: t('libSortOldest') },
    { value: 'title', label: t('libSortTitle') },
  ];
}

function normalizePlayList(tracks) {
  return (tracks || []).map((tr) => normalizeTrack(tr)).filter(Boolean);
}

export default function Library() {
  const {
    library,
    playlists,
    libraryLoading,
    loadPlaylistsData,
    removeFromLibrary,
    removeFromPlaylist,
    reorderTracksInPlaylist,
    deletePlaylist,
  } = useLibraryDataContext();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam === 'playlists') return 'playlists';
    if (tabParam === 'recent') return 'recent';
    return 'tracks';
  });
  const [recentTracks, setRecentTracks] = useState(() => readRecentlyPlayed());
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [localPlaylistTracks, setLocalPlaylistTracks] = useState([]);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [filterKey, setFilterKey] = useState(null);
  const [filterBpmRange, setFilterBpmRange] = useState({ min: BPM_MIN, max: BPM_MAX });
  const [showDjFilters, setShowDjFilters] = useState(false);

  const {
    togglePlay,
    playQueue,
    playShuffledQueue,
    currentTrackId,
    isPlaying,
    isLoading,
    downloadedTracks,
    handleDownload,
    playbackQuality,
    lang,
    t,
    djFeaturesActive = false,
    likedTracks,
    toggleLike,
    startTrackRadio,
    radioLoadingTrackId,
  } = useOutletContext();

  const { getFeatures, pendingCount } = useTrackFeaturesForList(library, {
    analyze: djFeaturesActive,
    enabled: djFeaturesActive,
  });

  const isBpmActive = isBpmFilterActive(filterBpmRange);

  useEffect(() => {
    const tab = searchParams.get('tab');
    setActiveTab(tab === 'playlists' ? 'playlists' : tab === 'recent' ? 'recent' : 'tracks');
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'recent') {
      setRecentTracks(readRecentlyPlayed());
    }
  }, [activeTab, currentTrackId, isPlaying]);

  useEffect(() => {
    if (activeTab === 'playlists' || selectedPlaylistId != null) {
      loadPlaylistsData(undefined, { background: playlists.length > 0 });
    }
  }, [activeTab, selectedPlaylistId, loadPlaylistsData, playlists.length]);

  const setTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'tracks' ? {} : { tab }, { replace: true });
  };

  const selectedPlaylist = playlists.find((p) => playlistIdsMatch(p.id, selectedPlaylistId));

  useEffect(() => {
    setLocalPlaylistTracks(selectedPlaylist?.tracks || []);
  }, [selectedPlaylistId, selectedPlaylist?.tracks]);

  useEffect(() => {
    if (selectedPlaylistId == null) return;
    if (!playlists.some((p) => playlistIdsMatch(p.id, selectedPlaylistId))) {
      setSelectedPlaylistId(null);
      setActiveTab('playlists');
      setSearchParams({ tab: 'playlists' }, { replace: true });
    }
  }, [playlists, selectedPlaylistId, setSearchParams]);

  const playTracks = (tracks) => {
    const list = normalizePlayList(tracks);
    if (!list.length) return;
    if (playQueue) {
      playQueue(list[0], list);
    } else {
      togglePlay(list[0], list);
    }
  };

  const shuffleTracks = (tracks) => {
    const list = normalizePlayList(tracks);
    if (!list.length) return;
    if (playShuffledQueue) {
      playShuffledQueue(list);
      return;
    }
    playTracks(list);
  };

  const downloadAllTracks = async (tracks) => {
    if (!tracks?.length) return;
    const msg = t('libDownloadAllConfirm').replace('{n}', String(tracks.length));
    if (!confirm(msg)) return;
    try {
      for (const track of tracks) {
        await startDownloadJob({
          url: track.source_url || `https://tidal.com/track/${track.provider_id}`,
          quality: playbackQuality || 'LOSSLESS',
          track,
        });
      }
      showToast(t('libPlaylistDownloadStarted'));
    } catch (err) {
      showToast(messageForApiError(err, lang));
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    if (!confirm(t('libDeletePlaylistConfirm'))) return;
    if (playlistIdsMatch(selectedPlaylistId, playlistId)) {
      setSelectedPlaylistId(null);
      setActiveTab('playlists');
      setSearchParams({ tab: 'playlists' }, { replace: true });
    }
    await deletePlaylist(playlistId);
  };

  const sharePlaylist = async () => {
    if (!selectedPlaylist?.id || !hasAuthSession()) {
      showToast(t('libShareNeedLogin'));
      return;
    }
    try {
      const { token } = await createPlaylistShareLink(selectedPlaylist.id, lang);
      const url = shareUrlFromToken(token);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt(lang === 'ru' ? 'Скопируйте ссылку:' : 'Copy link:', url);
      }
      showToast(t('libShareCopied'));
    } catch (err) {
      showToast(messageForApiError(err, lang));
    }
  };

  const isTrackCurrent = (track) => currentTrackId === String(track.provider_id);
  const showPauseIcon = (track) => isTrackCurrent(track) && (isPlaying || isLoading);

  const handleRowPlay = (track, contextList) => {
    const normalized = normalizeTrack(track);
    if (!normalized) return;
    const list = contextList?.length ? normalizePlayList(contextList) : null;
    togglePlay(normalized, list);
  };

  const handleDownloadLocal = async (track, e) => {
    if (handleDownload) await handleDownload(track, e);
  };

  const renderToolbar = (tracks, { testIdPrefix = 'library', onShare, onDelete } = {}) => {
    const hasTracks = tracks?.length > 0;
    if (!hasTracks && !onShare && !onDelete) return null;
    return (
      <div
        className={[
          'library-toolbar',
          testIdPrefix === 'playlist' ? 'library-toolbar--flush' : '',
        ].filter(Boolean).join(' ')}
        data-testid={`${testIdPrefix}-toolbar`}
      >
        {hasTracks && (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => playTracks(tracks)}
              data-testid={`${testIdPrefix}-play-all`}
            >
              <Play size={18} fill="currentColor" />
              {t('libPlayAll')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => shuffleTracks(tracks)}
              data-testid={`${testIdPrefix}-shuffle-play`}
            >
              <Shuffle size={18} />
              {t('libShufflePlay')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadAllTracks(tracks)}
              data-testid={`${testIdPrefix}-download-all`}
            >
              <Download size={18} />
              {t('libDownloadAll')}
            </button>
          </>
        )}
        {onShare && (
          <button type="button" className="btn-secondary" onClick={onShare}>
            <Share2 size={18} />
            {' '}
            {t('libShare')}
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn-danger" onClick={onDelete}>
            <Trash2 size={18} />
            {' '}
            {t('libDelete')}
          </button>
        )}
      </div>
    );
  };

  const renderTrack = (
    track,
    index,
    contextList,
    onRemove,
    { dragHandleStart = null, disableMotion = false } = {},
  ) => (
    <TrackRow
      key={String(track.provider_id)}
      track={track}
      index={index}
      variant="library"
      disableMotion={disableMotion}
      isCurrent={isTrackCurrent(track)}
      showPlayingOverlay={isPlaying}
      onClick={() => handleRowPlay(track, contextList)}
      footer={djFeaturesActive ? (
        <TrackDjMeta
          track={track}
          getFeatures={getFeatures}
          pendingLabel={t('libBpmKeyPending')}
        />
      ) : null}
      actions={(
        <TrackRowActions
          track={track}
          list={contextList}
          t={t}
          likedTracks={likedTracks}
          downloadedTracks={downloadedTracks}
          isTrackCurrent={isTrackCurrent}
          showPauseIcon={showPauseIcon}
          onTogglePlay={handleRowPlay}
          onToggleLike={toggleLike}
          onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
          onDownload={handleDownloadLocal}
          onStartRadio={startTrackRadio}
          radioLoading={radioLoadingTrackId === String(track.provider_id)}
          radioBusy={Boolean(radioLoadingTrackId)}
          onRemove={onRemove || undefined}
          onDragStart={dragHandleStart || undefined}
          removeTitle={onRemove ? t('libRemove') : undefined}
          testIdPrefix="library"
        />
      )}
    />
  );

  const librarySummary = formatTrackCountAndDuration(library.length, sumTrackDurations(library), t);

  const filteredLibrary = library
    .filter((track) => {
      if (
        searchQuery
        && !track.title.toLowerCase().includes(searchQuery.toLowerCase())
        && !(track.artists && track.artists.join(', ').toLowerCase().includes(searchQuery.toLowerCase()))
      ) {
        return false;
      }
      if (djFeaturesActive && (filterKey || isBpmActive) && !trackPassesDjFilters(getFeatures(track), {
        filterKey,
        bpmRange: filterBpmRange,
        isBpmActive,
      })) {
        return false;
      }
      return true;
    })
    .sort((a, b) => librarySortCompare(a, b, sortOrder));

  const analyzingLabel = pendingCount > 0
    ? `${t('libAnalyzing')} ${pendingCount} ${t(pendingCount === 1 ? 'libTrackWord' : 'libTracksWord')}…`
    : null;

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      minHeight: 0,
    }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '3rem', fontWeight: 700, margin: 0, color: 'white' }}>
          {t('libTitle')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '1.1rem' }}>
          {t('libSubtitle')}
        </p>
        {!selectedPlaylistId && activeTab === 'tracks' && library.length > 0 && (
          <p style={{
            color: 'var(--accent-solid)',
            marginTop: '6px',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
          >
            {librarySummary}
          </p>
        )}
      </div>

      {selectedPlaylistId && selectedPlaylist ? (
        <div className="playlist-detail-view">
          <button
            type="button"
            onClick={() => setSelectedPlaylistId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '24px',
              alignSelf: 'flex-start',
              fontSize: '1rem',
            }}
          >
            <ChevronLeft size={20} />
            {t('libBackPlaylists')}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
          }}
          >
            <div>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                margin: 0,
              }}
              >
                <ListMusic color="var(--accent-solid)" size={36} />
                {selectedPlaylist.name}
              </h2>
              {selectedPlaylist.tracks?.length > 0 && (
                <p style={{
                  margin: '8px 0 0 52px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.95rem',
                }}
                >
                  {formatTrackCountAndDuration(
                    selectedPlaylist.tracks.length,
                    sumTrackDurations(selectedPlaylist.tracks),
                    t,
                  )}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {renderToolbar(localPlaylistTracks.length ? localPlaylistTracks : selectedPlaylist.tracks, {
                testIdPrefix: 'playlist',
                onShare: typeof selectedPlaylist.id === 'number' ? sharePlaylist : undefined,
                onDelete: () => handleDeletePlaylist(selectedPlaylist.id),
              })}
            </div>
          </div>

          {selectedPlaylist.tracks.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              <p>{t('libPlaylistEmpty')}</p>
            </div>
          ) : (
            <PlaylistTrackList
              tracks={localPlaylistTracks}
              onTracksChange={setLocalPlaylistTracks}
              onReorderCommit={(ordered) => {
                if (selectedPlaylist?.id) reorderTracksInPlaylist(selectedPlaylist.id, ordered);
              }}
              renderItem={(track, dragHandleStart, list) => renderTrack(
                track,
                list.findIndex((tr) => String(tr.provider_id) === String(track.provider_id)),
                list,
                (trackId) => removeFromPlaylist(selectedPlaylist.id, trackId),
                { dragHandleStart, disableMotion: true },
              )}
            />
          )}
        </div>
      ) : (
        <>
          <div
            className="library-tabs"
            style={{
              display: 'flex',
              gap: '24px',
              marginBottom: '24px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '16px',
            }}
          >
            <button
              type="button"
              onClick={() => setTab('tracks')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'tracks' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                transition: 'color 0.2s',
              }}
            >
              {t('libLikedTracks')}
              {' '}
              (
              {library.length}
              )
            </button>
            <button
              type="button"
              onClick={() => setTab('playlists')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'playlists' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                transition: 'color 0.2s',
              }}
            >
              {t('libPlaylistsTab')}
              {' '}
              (
              {playlists.length}
              )
            </button>
            <button
              type="button"
              onClick={() => setTab('recent')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'recent' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                transition: 'color 0.2s',
              }}
            >
              {t('libRecentTab')}
              {' '}
              (
              {recentTracks.length}
              )
            </button>
          </div>

          {activeTab === 'tracks' && !libraryLoading && filteredLibrary.length > 0 && (
            renderToolbar(filteredLibrary)
          )}
          {activeTab === 'recent' && recentTracks.length > 0 && (
            renderToolbar(recentTracks, { testIdPrefix: 'recent' })
          )}

          {activeTab !== 'recent' && (
            <div
              className="library-filter-row"
              style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '24px',
                alignItems: 'center',
              }}
            >
              <div
                className="glass-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 16px',
                  borderRadius: '24px',
                  flex: 1,
                }}
              >
                <Search size={20} color="var(--text-muted)" style={{ marginRight: '12px' }} />
                <input
                  type="text"
                  placeholder={t('libSearchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    padding: '8px 0',
                    outline: 'none',
                  }}
                />
              </div>

              <GlassDropdown
                testId="library-sort"
                value={sortOrder}
                onChange={setSortOrder}
                options={sortOptions(t)}
                minWidth={180}
              />

              {djFeaturesActive && (
                <button
                  type="button"
                  data-testid="library-dj-filters-btn"
                  onClick={() => setShowDjFilters(!showDjFilters)}
                  className="glass-panel library-dj-filters-btn"
                  style={{
                    border: showDjFilters ? '1px solid var(--accent-solid)' : '1px solid var(--border-subtle)',
                    background: showDjFilters ? 'var(--accent-glow)' : 'transparent',
                    color: showDjFilters ? 'white' : 'var(--text-secondary)',
                    padding: '10px 18px',
                    borderRadius: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                  }}
                >
                  <Disc size={18} />
                  {' '}
                  {t('libDjFilters')}
                </button>
              )}
            </div>
          )}

          {activeTab !== 'recent' && (
            <AnimatePresence>
              {djFeaturesActive && showDjFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <DjFiltersPanel
                    panelTitle={t('libDjFilters')}
                    camelotTitle={t('libCamelotFilter')}
                    bpmTitle={t('libBpmRange')}
                    filterKey={filterKey}
                    onSelectKey={setFilterKey}
                    filterBpmRange={filterBpmRange}
                    onBpmRangeChange={setFilterBpmRange}
                    pendingCount={pendingCount}
                    analyzingLabel={analyzingLabel}
                    clearKeyLabel={t('libClearKey')}
                    onClose={() => setShowDjFilters(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
            {activeTab === 'recent' && (
              <AnimatePresence>
                {recentTracks.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    {t('libRecentEmpty')}
                  </motion.div>
                ) : (
                  <>
                    <p style={{
                      color: 'var(--accent-solid)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      margin: '0 0 16px',
                    }}
                    >
                      {formatTrackCountAndDuration(
                        recentTracks.length,
                        sumTrackDurations(recentTracks),
                        t,
                      )}
                    </p>
                    <VirtualTrackList
                      items={recentTracks}
                      renderItem={(track, i) => renderTrack(track, i, recentTracks, null)}
                      style={{ minHeight: '200px' }}
                    />
                  </>
                )}
              </AnimatePresence>
            )}

            {activeTab === 'tracks' && (
              <AnimatePresence>
                {libraryLoading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    {t('libLoading')}
                  </motion.div>
                ) : filteredLibrary.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    {t(searchQuery ? 'libEmptySearch' : 'libEmpty')}
                  </motion.div>
                ) : (
                  <VirtualTrackList
                    items={filteredLibrary}
                    renderItem={(track, i) => renderTrack(track, i, filteredLibrary, removeFromLibrary)}
                    style={{ minHeight: '200px' }}
                  />
                )}
              </AnimatePresence>
            )}

            {activeTab === 'playlists' && (
              <div>
                <button
                  type="button"
                  onClick={() => setPlaylistModalTrack(true)}
                  className="btn-primary"
                  style={{
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '20px',
                    padding: '12px 24px',
                    fontSize: '1rem',
                  }}
                >
                  <Plus size={20} />
                  {t('libCreatePlaylist')}
                </button>

                {playlists.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    marginTop: '40px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                  >
                    <ListMusic size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>{t('libNoPlaylists')}</p>
                  </div>
                ) : (
                  <div className="library-playlist-grid">
                    {playlists.map((pl) => (
                      <PlaylistCard
                        key={pl.id}
                        playlist={pl}
                        t={t}
                        onOpen={setSelectedPlaylistId}
                        onPlay={(p) => playTracks(p.tracks)}
                        onShuffle={(p) => shuffleTracks(p.tracks)}
                        onDelete={handleDeletePlaylist}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {playlistModalTrack === true && (
        <PlaylistModal
          track={null}
          onClose={() => setPlaylistModalTrack(null)}
          onUpdated={() => dispatchLibraryReloadRequest()}
        />
      )}

      {playlistModalTrack && playlistModalTrack !== true && (
        <PlaylistModal
          track={playlistModalTrack}
          onClose={() => setPlaylistModalTrack(null)}
          onUpdated={() => dispatchLibraryReloadRequest()}
        />
      )}
    </div>
  );
}
