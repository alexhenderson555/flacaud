import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Disc } from 'lucide-react';
import { coverImgSrc } from '../utils/coverUrl';
import ArtistLine from './ArtistLine';
import { formatTrackYear } from '../utils/trackNormalize';
import { chartRankClass } from '../utils/chartRankStyle';
import { formatDurationSeconds, trackDurationSeconds } from '../utils/trackDuration';

/**
 * Shared track list row (Library, Recommendations, playlists).
 * variant: "library" (64px art) | "compact" (48px art)
 */
function TrackRow({
  track,
  index = 0,
  variant = 'compact',
  className = '',
  panelClass = 'glass-panel',
  onClick,
  titleExtra = null,
  titlePrefix = null,
  chartRank = null,
  subtitle = null,
  showAlbum = true,
  footer = null,
  actions = null,
  isCurrent = false,
  showPlayingOverlay = false,
  showDuration = true,
  disableMotion = false,
}) {
  const Row = disableMotion ? 'div' : motion.div;
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [track?.provider_id, track?.cover_url]);
  const yearLabel = formatTrackYear(track);
  const durationSec = trackDurationSeconds(track);
  const durationLabel = showDuration && durationSec > 0
    ? formatDurationSeconds(durationSec)
    : null;
  const isChart = chartRank != null && chartRank > 0;
  const rowClass = [
    'track-row',
    variant === 'library' ? 'track-row--library' : 'track-row--compact',
    isChart ? 'track-row--chart' : '',
    panelClass,
    onClick ? 'track-row--clickable' : '',
    className,
  ].filter(Boolean).join(' ');

  const motionProps = disableMotion ? {} : {
    initial: { opacity: 0, x: variant === 'library' ? -20 : 0, y: variant === 'library' ? 0 : 20 },
    animate: { opacity: 1, x: 0, y: 0 },
    transition: {
      delay: variant === 'library' ? (index < 12 ? index * 0.02 : 0) : index * 0.05,
    },
  };

  return (
    <Row
      key={track?.provider_id}
      {...motionProps}
      className={rowClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div className="track-row__cover-wrap">
        {track.cover_url && !coverFailed ? (
          <img
            key={`${track.provider_id}-${track.cover_url}`}
            src={coverImgSrc(track.cover_url)}
            alt=""
            className="track-row__cover"
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="track-row__cover track-row__cover--placeholder">
            <Disc size={variant === 'library' ? 24 : 20} />
          </div>
        )}
        {showPlayingOverlay && isCurrent && (
          <div className="track-row__playing-overlay">
            <div className="playing-indicator"><div /><div /><div /></div>
          </div>
        )}
      </div>

      {isChart ? (
        <span className={`track-row__rank ${chartRankClass(chartRank)}`} aria-hidden>
          {chartRank}
        </span>
      ) : null}

      <div className="track-row__meta">
        <div className={`track-row__title${isCurrent ? ' track-row__title--active' : ''}`}>
          {!isChart ? titlePrefix : null}
          <span className="track-row__title-text">
            {track.title}
            {track.version ? ` (${track.version})` : ''}
          </span>
          {titleExtra}
        </div>
        <div className="track-row__artist">
          {subtitle ?? (
            <>
              <ArtistLine track={track} stopPropagation />
              {showAlbum && track.album && (
                <>
                  <span> • </span>
                  {track.album_id ? (
                    <Link
                      to={`/album/${track.album_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="track-row__album-link"
                    >
                      {track.album}
                    </Link>
                  ) : (
                    track.album
                  )}
                </>
              )}
              {yearLabel ? <span>{` • ${yearLabel}`}</span> : null}
            </>
          )}
        </div>
        {footer}
      </div>

      {durationLabel ? (
        <span className="track-row__duration" aria-label={`Duration ${durationLabel}`}>
          {durationLabel}
        </span>
      ) : null}

      {actions && (
        <div className="track-row__actions" role="button" tabIndex={0} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
          {actions}
        </div>
      )}
    </Row>
  );
}

export default memo(TrackRow);
