import { ListMusic, Play, Shuffle, Trash2 } from 'lucide-react';
import { coverImgSrc } from '../utils/coverUrl';
import { formatTrackCountAndDuration, sumTrackDurations } from '../utils/trackDuration';

export default function PlaylistCard({
  playlist,
  t,
  onOpen,
  onPlay,
  onShuffle,
  onDelete,
}) {
  const hasTracks = playlist.tracks?.length > 0;
  const cover = hasTracks ? playlist.tracks[0].cover_url : null;

  return (
    <article
      className="library-playlist-card glass-panel"
      data-testid={`playlist-card-${playlist.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(playlist.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(playlist.id);
        }
      }}
    >
      <button
        type="button"
        className="library-playlist-card__open"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(playlist.id);
        }}
        aria-label={playlist.name}
      >
        <div className="library-playlist-card__cover">
          {cover ? (
            <img src={coverImgSrc(cover)} alt="" />
          ) : (
            <div className="library-playlist-card__cover-placeholder">
              <ListMusic size={48} />
            </div>
          )}
        </div>
        <div className="library-playlist-card__meta">
          <div className="library-playlist-card__name">{playlist.name}</div>
          <div className="library-playlist-card__stats">
            {formatTrackCountAndDuration(
              playlist.tracks.length,
              sumTrackDurations(playlist.tracks),
              t,
            )}
          </div>
        </div>
      </button>

      <div className="library-playlist-card__actions" aria-label={playlist.name}>
        <button
          type="button"
          className="library-playlist-card__action library-playlist-card__action--play"
          title={t('libPlayAll')}
          aria-label={t('libPlayAll')}
          disabled={!hasTracks}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(playlist);
          }}
          data-testid={`playlist-card-play-${playlist.id}`}
        >
          <Play size={18} fill="currentColor" />
        </button>
        <button
          type="button"
          className="library-playlist-card__action"
          title={t('libShufflePlay')}
          aria-label={t('libShufflePlay')}
          disabled={!hasTracks}
          onClick={(e) => {
            e.stopPropagation();
            onShuffle(playlist);
          }}
          data-testid={`playlist-card-shuffle-${playlist.id}`}
        >
          <Shuffle size={17} />
        </button>
        <button
          type="button"
          className="library-playlist-card__action library-playlist-card__action--danger"
          title={t('libDelete')}
          aria-label={t('libDelete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(playlist.id);
          }}
          data-testid={`playlist-card-delete-${playlist.id}`}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}
