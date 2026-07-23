import { motion } from 'framer-motion';
import { Play, Music, ExternalLink } from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';
import TrackRowActions from '../TrackRowActions';
import ArtistLine from '../ArtistLine';
import { normalizeSetMatchedTrack, setTrackRowDurationSeconds } from '../../utils/setAnalyzerUtils';
import { formatDurationSeconds } from '../../utils/trackDuration';

// One row of the analyzed set tracklist: timestamp (seek), cover, title/artist,
// duration, and the shared TrackRowActions (play/like/add/download).
export default function SetTracklistRow({
  row,
  index,
  nextRow,
  canPlaySet,
  t,
  tApp,
  playableTracks,
  likedTracks,
  downloadedTracks,
  currentTrackId,
  isPlaying,
  onSeek,
  onPlayTidal,
  onToggleLike,
  onStartRadio,
  radioLoadingTrackId = null,
  onDownload,
  onAddToPlaylist,
}) {
  const track = normalizeSetMatchedTrack(row);
  const durationSec = setTrackRowDurationSeconds(row, nextRow, track);
  const durationLabel = durationSec > 0 ? formatDurationSeconds(durationSec) : null;

  return (
    <motion.div
      data-testid="set-tracklist-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.02 }}
      className="glass-panel track-row track-row--library set-tracklist-row"
    >
      {canPlaySet ? (
        <button
          type="button"
          className="set-tracklist__timestamp"
          data-testid="set-tracklist-timestamp"
          onClick={() => onSeek(row.timestamp)}
          title={t('playSetAt')}
        >
          <Play size={12} aria-hidden />
          <span>{row.timestamp}</span>
        </button>
      ) : (
        <span className="set-tracklist__timestamp set-tracklist__timestamp--static">
          {row.timestamp}
        </span>
      )}

      <div className="track-row__cover-wrap">
        {track?.cover_url ? (
          <img src={coverImgSrc(track.cover_url)} alt="" className="track-row__cover" />
        ) : (
          <div className="track-row__cover track-row__cover--placeholder">
            <Music size={22} />
          </div>
        )}
      </div>

      <div className="track-row__meta">
        <div className="track-row__title">
          <span className="track-row__title-text">{row.title}</span>
        </div>
        <div className="track-row__artist">
          {track ? <ArtistLine track={track} stopPropagation /> : row.artist}
        </div>
      </div>

      <span
        className="track-row__duration"
        data-testid={durationLabel ? 'set-tracklist-duration' : undefined}
      >
        {durationLabel || ''}
      </span>

      <div className="track-row__actions">
        {track ? (
          <TrackRowActions
            track={track}
            list={playableTracks}
            t={tApp}
            likedTracks={likedTracks}
            downloadedTracks={downloadedTracks}
            isTrackCurrent={(tr) => String(tr.provider_id) === String(currentTrackId)}
            showPauseIcon={(tr) => String(tr.provider_id) === String(currentTrackId) && isPlaying}
            onTogglePlay={onPlayTidal}
            onToggleLike={onToggleLike}
            onAddToPlaylist={onAddToPlaylist}
            onDownload={onDownload}
            onStartRadio={onStartRadio}
            radioLoading={radioLoadingTrackId === String(track.provider_id)}
            radioBusy={Boolean(radioLoadingTrackId)}
            testIdPrefix="set-analyzer"
          />
        ) : (
          <a
            href={`https://music.youtube.com/search?q=${encodeURIComponent(`${row.artist || ''} ${row.title || ''}`.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={t('searchYouTubeMusic')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem',
              color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            {t('notFound')}
            <ExternalLink size={13} aria-hidden />
          </a>
        )}
      </div>
    </motion.div>
  );
}
