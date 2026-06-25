import { Fragment, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useArtistCardStore } from '../store/useArtistCardStore';
import { resolveArtistId } from '../utils/resolveArtist';

/**
 * Artist names — click opens artist card (Tidal id or resolve-by-name).
 */
export default function ArtistLine({
  track,
  stopPropagation = false,
  style,
  className,
}) {
  const artists = track?.artists;
  const lang = usePlayerStore((s) => s.lang);
  const openArtistCard = useArtistCardStore((s) => s.openArtistCard);
  const [resolving, setResolving] = useState(null);

  if (!artists?.length) {
    return <span style={style} className={className}>Unknown Artist</span>;
  }

  const handleArtistClick = async (e, artistName, artistId) => {
    if (stopPropagation) e.stopPropagation();
    if (resolving) return;

    let id = artistId ? String(artistId) : null;
    if (!id) {
      setResolving(artistName);
      try {
        id = await resolveArtistId(artistName, lang);
      } catch {
        return;
      } finally {
        setResolving(null);
      }
    }
    if (id) openArtistCard(id, artistName);
  };

  return (
    <span style={style} className={className}>
      {artists.map((artistName, i) => {
        const artistId = track.artist_ids?.[i];
        const isResolving = resolving === artistName;
        return (
          <Fragment key={`${artistName}-${i}`}>
            {i > 0 && ', '}
            <button
              type="button"
              className="artist-line-link"
              aria-label={lang === 'ru' ? `Артист: ${artistName}` : `Artist: ${artistName}`}
              style={{
                color: 'inherit',
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                cursor: isResolving ? 'wait' : 'pointer',
                opacity: isResolving ? 0.7 : 1,
              }}
              disabled={!!resolving}
              onClick={(e) => { void handleArtistClick(e, artistName, artistId); }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              {artistName}
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}
