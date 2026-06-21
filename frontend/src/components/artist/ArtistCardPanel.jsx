import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Disc, Loader2, X } from 'lucide-react';
import { apiGetJson } from '../../utils/apiClient';
import { coverImgSrc } from '../../utils/coverUrl';
import { emojiAvatarForId } from '../../utils/profileAvatars';
import { normalizeTrack } from '../../utils/trackNormalize';
import { useArtistCardStore } from '../../store/useArtistCardStore';

export default function ArtistCardPanel({
  lang = 'en',
  onPlayTrack,
}) {
  const artistId = useArtistCardStore((s) => s.artistId);
  const fallbackName = useArtistCardStore((s) => s.artistName);
  const closeArtistCard = useArtistCardStore((s) => s.closeArtistCard);

  const [profile, setProfile] = useState(null);
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    if (!artistId) {
      setProfile(null);
      setBio('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setBio('');

    void (async () => {
      try {
        const data = await apiGetJson(`/api/artist/${artistId}`, { lang });
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [artistId, lang]);

  useEffect(() => {
    if (!artistId || !profile?.artist?.name) return undefined;
    let cancelled = false;
    setBioLoading(true);
    setBio('');

    void apiGetJson(`/api/artist/${artistId}/bio`, { lang })
      .then((data) => {
        if (!cancelled) setBio((data?.bio || '').trim());
      })
      .catch(() => {
        if (!cancelled) setBio('');
      })
      .finally(() => {
        if (!cancelled) setBioLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistId, profile, lang]);

  if (!artistId) return null;

  const artist = profile?.artist;
  const name = artist?.name || fallbackName || 'Artist';
  const topTracks = (profile?.top_tracks || [])
    .map((tr) => normalizeTrack({
      ...tr,
      artist_ids: tr.artist_ids?.length ? tr.artist_ids : [String(artistId)],
    }))
    .filter(Boolean)
    .slice(0, 5);
  const albums = (profile?.albums || []).slice(0, 4);
  const emoji = emojiAvatarForId(artistId);

  return (
    <motion.div
      className="artist-card-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="artist-card-panel"
      onClick={closeArtistCard}
    >
      <motion.article
        className="artist-card-panel glass-panel"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="artist-card-panel__toolbar">
          <Link to={`/artist/${artistId}`} className="artist-card-panel__full-link">
            {lang === 'ru' ? 'Открыть профиль' : 'Open full profile'}
          </Link>
          <button
            type="button"
            className="artist-card-panel__close"
            onClick={closeArtistCard}
            aria-label={lang === 'ru' ? 'Закрыть' : 'Close'}
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="artist-card-panel__loading">
            <Loader2 size={22} className="spin" aria-hidden />
            <span>{lang === 'ru' ? 'Загрузка артиста…' : 'Loading artist…'}</span>
          </div>
        ) : (
          <>
            <div className="artist-card-panel__head">
              <div className="artist-card-panel__avatar" title={name} aria-hidden>
                {emoji}
              </div>
              <h2 className="artist-card-panel__name">{name}</h2>
            </div>

            {(bioLoading || bio) && (
              <div className="artist-card-panel__bio">
                {bioLoading ? (
                  <p className="artist-card-panel__bio-loading">
                    {lang === 'ru' ? 'Био…' : 'Bio…'}
                  </p>
                ) : (
                  <p>{bio}</p>
                )}
              </div>
            )}

            {topTracks.length > 0 && (
              <div className="artist-card-panel__section">
                <h3>{lang === 'ru' ? 'Топ-треки' : 'Top tracks'}</h3>
                <ul className="artist-card-panel__tracks">
                  {topTracks.map((track) => (
                    <li key={track.provider_id}>
                      <button
                        type="button"
                        className="artist-card-panel__track-btn"
                        onClick={() => onPlayTrack?.(track, topTracks)}
                      >
                        <span className="artist-card-panel__track-title">{track.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {albums.length > 0 && (
              <div className="artist-card-panel__section">
                <h3>{lang === 'ru' ? 'Альбомы' : 'Albums'}</h3>
                <div className="artist-card-panel__albums">
                  {albums.map((album) => (
                    <Link
                      key={album.id}
                      to={`/album/${album.id}`}
                      className="artist-card-panel__album"
                      title={album.title}
                      onClick={closeArtistCard}
                    >
                      <div className="artist-card-panel__album-cover">
                        {album.cover_url ? (
                          <img src={coverImgSrc(album.cover_url)} alt="" />
                        ) : (
                          <Disc size={22} color="var(--text-muted)" />
                        )}
                      </div>
                      <span className="artist-card-panel__album-title">{album.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </motion.article>
    </motion.div>
  );
}
