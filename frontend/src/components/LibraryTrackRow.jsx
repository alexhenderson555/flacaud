import TrackRow from './TrackRow';
import TrackRowActions from './TrackRowActions';
import TrackDjMeta from './TrackDjMeta';

/**
 * Library-style track row: 64px art, full action set, optional DJ meta footer.
 */
export default function LibraryTrackRow({
  track,
  index,
  list,
  t,
  likedTracks,
  downloadedTracks,
  currentTrackId,
  isPlaying,
  isLoading = false,
  onTogglePlay,
  onToggleLike,
  onAddToPlaylist,
  onDownload,
  onRemove,
  removeTitle,
  djFeaturesActive = false,
  getFeatures,
  pendingLabel,
  testIdPrefix = 'track',
  showAlbum,
  subtitle,
  onClick,
  panelClass,
}) {
  const isTrackCurrent = (tr) => currentTrackId === String(tr.provider_id);
  const showPauseIcon = (tr) => isTrackCurrent(tr) && (isPlaying || isLoading);
  const handleRowClick = onClick ?? (onTogglePlay
    ? () => { onTogglePlay(track, list); }
    : undefined);

  return (
    <TrackRow
      track={track}
      index={index}
      variant="library"
      panelClass={panelClass}
      showAlbum={showAlbum}
      subtitle={subtitle}
      isCurrent={isTrackCurrent(track)}
      showPlayingOverlay={isPlaying}
      onClick={handleRowClick}
      footer={djFeaturesActive ? (
        <TrackDjMeta
          track={track}
          getFeatures={getFeatures}
          pendingLabel={pendingLabel || t('libBpmKeyPending')}
        />
      ) : null}
      actions={(
        <TrackRowActions
          track={track}
          list={list}
          t={t}
          likedTracks={likedTracks}
          downloadedTracks={downloadedTracks}
          isTrackCurrent={isTrackCurrent}
          showPauseIcon={showPauseIcon}
          onTogglePlay={onTogglePlay}
          onToggleLike={onToggleLike}
          onAddToPlaylist={onAddToPlaylist}
          onDownload={onDownload}
          onRemove={onRemove}
          removeTitle={removeTitle}
          testIdPrefix={testIdPrefix}
        />
      )}
    />
  );
}
