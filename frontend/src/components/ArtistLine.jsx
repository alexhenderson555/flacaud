import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/**
 * Artist names with links when artist_ids are present (same behaviour as PlayerBar).
 */
export default function ArtistLine({
  track,
  stopPropagation = false,
  style,
  className,
}) {
  const artists = track?.artists;
  if (!artists?.length) {
    return <span style={style} className={className}>Unknown Artist</span>;
  }

  const linkProps = stopPropagation
    ? {
        onClick: (e) => e.stopPropagation(),
        onMouseEnter: (e) => { e.target.style.textDecoration = 'underline'; },
        onMouseLeave: (e) => { e.target.style.textDecoration = 'none'; },
      }
    : {
        onMouseEnter: (e) => { e.target.style.textDecoration = 'underline'; },
        onMouseLeave: (e) => { e.target.style.textDecoration = 'none'; },
      };

  return (
    <span style={style} className={className}>
      {artists.map((artistName, i) => {
        const artistId = track.artist_ids?.[i];
        return (
          <Fragment key={`${artistName}-${i}`}>
            {i > 0 && ', '}
            {artistId ? (
              <Link
                to={`/artist/${artistId}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
                {...linkProps}
              >
                {artistName}
              </Link>
            ) : (
              artistName
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
