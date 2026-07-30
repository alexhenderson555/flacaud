import { Disc, Play, Trash2 } from 'lucide-react';

export default function AlbumCard({
  album,
  t,
  lang,
  onOpen,
  onPlay,
  onDelete,
}) {
  let artists = [];
  try { artists = JSON.parse(album.artists_json) || []; } catch { /* ignore */ }
  const artistsLabel = artists.join(', ');
  const trackCount = album.track_count || 0;

  return (
    <article
      className="library-playlist-card glass-panel"
      data-testid={`album-card-${album.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(album.provider_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(album.provider_id);
        }
      }}
    >
      <button
        type="button"
        className="library-playlist-card__open"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(album.provider_id);
        }}
        aria-label={album.title}
      >
        <div className="library-playlist-card__cover">
          {album.cover_url ? (
            <img src={album.cover_url} alt="" />
          ) : (
            <div className="library-playlist-card__cover-placeholder">
              <Disc size={48} />
            </div>
          )}
        </div>
        <div className="library-playlist-card__meta">
          <div className="library-playlist-card__name">{album.title}</div>
          <div className="library-playlist-card__stats">
            {artistsLabel}
            {artistsLabel && ' • '}
            {trackCount} {lang === 'ru' ? 'тр.' : 'tr.'}
          </div>
        </div>
      </button>

      <div className="library-playlist-card__actions" aria-label={album.title}>
        <button
          type="button"
          className="library-playlist-card__action library-playlist-card__action--play"
          title={t('libPlayAll')}
          aria-label={t('libPlayAll')}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(album);
          }}
          data-testid={`album-card-play-${album.id}`}
        >
          <Play size={18} fill="currentColor" />
        </button>
        <button
          type="button"
          className="library-playlist-card__action library-playlist-card__action--danger"
          title={t('libDelete')}
          aria-label={t('libDelete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(album.id);
          }}
          data-testid={`album-card-delete-${album.id}`}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}
