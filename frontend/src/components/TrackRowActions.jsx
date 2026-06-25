import { Play, Pause, Heart, Plus, Download, Check, Trash2, ArrowUp, ArrowDown, GripVertical, Radio, Loader2 } from 'lucide-react';
import { isTrackLiked } from '../utils/trackNormalize';

/**
 * Standard track-row actions: like, playlist, play, download, optional remove.
 */
export default function TrackRowActions({
  track,
  list,
  t,
  likedTracks,
  downloadedTracks,
  isTrackCurrent,
  showPauseIcon,
  onTogglePlay,
  onToggleLike,
  onAddToPlaylist,
  onDownload,
  onRemove,
  onStartRadio,
  radioLoading = false,
  radioBusy = false,
  removeTitle,
  onMoveUp,
  onMoveDown,
  onDragStart,
  showLike = true,
  showPlaylist = true,
  showPlay = true,
  showDownload = true,
  testIdPrefix = 'track',
}) {
  const liked = isTrackLiked(likedTracks, track);
  const downloaded = downloadedTracks?.has(track.provider_id);

  return (
    <>
      {onDragStart && (
        <button
          type="button"
          className="track-row__icon-btn track-row__icon-btn--ghost"
          aria-label={t('libDragToReorder') || 'Drag to reorder'}
          title={t('libDragToReorder') || 'Drag to reorder'}
          onPointerDown={(e) => {
            e.preventDefault();
            onDragStart(e);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'grab', touchAction: 'none' }}
        >
          <GripVertical size={18} />
        </button>
      )}
      {showLike && onToggleLike && (
        <button
          type="button"
          className="track-row__icon-btn track-row__icon-btn--ghost"
          onClick={(e) => onToggleLike(track, e)}
          title={liked ? t('removeFromLibrary') : t('addToLibrary')}
          aria-label={liked ? t('removeFromLibrary') : t('addToLibrary')}
        >
          <Heart
            size={20}
            fill={liked ? 'var(--accent-solid)' : 'none'}
            color={liked ? 'var(--accent-solid)' : 'var(--text-muted)'}
          />
        </button>
      )}
      {showPlaylist && onAddToPlaylist && (
        <button
          type="button"
          className="track-row__icon-btn track-row__icon-btn--ghost"
          onClick={(e) => onAddToPlaylist(track, e)}
          title={t('addToPlaylist')}
          aria-label={t('addToPlaylist')}
        >
          <Plus size={20} color="var(--text-muted)" />
        </button>
      )}
      {onStartRadio && (
        <button
          type="button"
          className="track-row__icon-btn track-row__icon-btn--ghost"
          data-testid={`${testIdPrefix}-radio-${track.provider_id}`}
          disabled={radioBusy}
          onClick={(e) => { e.stopPropagation(); onStartRadio(track); }}
          title={radioLoading ? (t('trackRadioStarting') || 'Starting radio…') : (t('startTrackRadio') || 'Track radio')}
          aria-label={radioLoading ? (t('trackRadioStarting') || 'Starting radio') : (t('startTrackRadio') || 'Track radio')}
        >
          {radioLoading ? (
            <Loader2 size={18} className="spin" color="var(--accent-solid)" />
          ) : (
            <Radio size={18} color="var(--text-muted)" />
          )}
        </button>
      )}
      {showPlay && onTogglePlay && (
        <button
          type="button"
          className="btn-secondary track-row__icon-btn"
          data-testid={`${testIdPrefix}-play-${track.provider_id}`}
          data-play-state={showPauseIcon(track) ? 'pause' : 'play'}
          onClick={(e) => { e.stopPropagation(); onTogglePlay(track, list); }}
          title={showPauseIcon(track) ? t('pause') : t('playPreview')}
          style={{ background: isTrackCurrent(track) ? 'var(--accent-glow)' : undefined }}
        >
          {showPauseIcon(track) ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      )}
      {showDownload && onDownload && (
        <button
          type="button"
          className="btn-primary track-row__icon-btn"
          data-testid={`${testIdPrefix}-download-${track.provider_id}`}
          onClick={(e) => onDownload(track, e)}
          title={downloaded ? t('downloaded') : t('download')}
          style={{ opacity: downloaded ? 0.7 : 1 }}
        >
          {downloaded ? <Check size={18} /> : <Download size={18} />}
        </button>
      )}
      {onRemove && (
        <>
          {onMoveUp && (
            <button
              type="button"
              className="track-row__icon-btn track-row__icon-btn--ghost"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              title={t('libMoveUp') || 'Move up'}
              aria-label={t('libMoveUp') || 'Move up'}
            >
              <ArrowUp size={18} />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              className="track-row__icon-btn track-row__icon-btn--ghost"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              title={t('libMoveDown') || 'Move down'}
              aria-label={t('libMoveDown') || 'Move down'}
            >
              <ArrowDown size={18} />
            </button>
          )}
        <button
          type="button"
          className="track-row__icon-btn track-row__icon-btn--ghost"
          onClick={(e) => { e.stopPropagation(); onRemove(track.provider_id); }}
          title={removeTitle || t('libRemove')}
          aria-label={removeTitle || t('libRemove')}
        >
          <Trash2 size={20} />
        </button>
        </>
      )}
    </>
  );
}
