import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Disc, Loader2, X } from 'lucide-react';
import { apiGetJson } from '../../utils/apiClient';
import { coverImgSrc } from '../../utils/coverUrl';
import { emojiAvatarForId } from '../../utils/profileAvatars';
import { fetchDeezerArtistImage } from '../../utils/artistImageFallback';
import { formatTrackYear, normalizeTrack } from '../../utils/trackNormalize';
import { formatDurationSeconds } from '../../utils/trackDuration';
import { useArtistCardStore } from '../../store/useArtistCardStore';

const TRACKS_PAGE = 5;

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
  const [pictureFailed, setPictureFailed] = useState(false);
  const [fallbackImage, setFallbackImage] = useState(null); // null = not tried; {url} once resolved
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [visibleTracks, setVisibleTracks] = useState(TRACKS_PAGE);

  useEffect(() => {
    if (!artistId) {
      setProfile(null);
      setBio('');
      setLoading(false);
      setBioLoading(false);
      setPictureFailed(false);
      setFallbackImage(null);
      setAvatarLoaded(false);
      setVisibleTracks(TRACKS_PAGE);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setBioLoading(true);
    setPictureFailed(false);
    setFallbackImage(null);
    setAvatarLoaded(false);
    setVisibleTracks(TRACKS_PAGE);
    setProfile(null);
    setBio('');

    const profileReq = apiGetJson(`/api/artist/${artistId}`, { lang })
      .then((data) => {
        if (!cancelled) setProfile(data);
        return data;
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
        return null;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void apiGetJson(`/api/artist/${artistId}/bio`, { lang, auth: true })
      .then((data) => {
        if (!cancelled) setBio((data?.bio || '').trim());
      })
      .catch(() => {
        if (!cancelled) setBio('');
      })
      .finally(() => {
        if (!cancelled) setBioLoading(false);
      });

    void profileReq;

    return () => { cancelled = true; };
  }, [artistId, lang]);

  const dedupeTracks = (tracks) => {
    const seen = new Set();
    return tracks.filter((tr) => {
      const key = String(tr.provider_id || tr.title || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const artist = profile?.artist;
  const name = artist?.name || fallbackName || 'Artist';
  const primaryUrl = artist?.picture_url && !pictureFailed ? coverImgSrc(artist.picture_url) : null;
  const avatarUrl = primaryUrl || fallbackImage?.url || null;

  // When the server returned no usable portrait, try Deezer from the browser.
  useEffect(() => {
    if (loading || !artistId) return undefined;
    const hasPrimary = Boolean(artist?.picture_url) && !pictureFailed;
    if (hasPrimary || fallbackImage !== null) return undefined; // have one, or already tried
    if (!name || name === 'Artist') return undefined;
    let cancelled = false;
    fetchDeezerArtistImage(name).then((url) => {
      if (!cancelled) setFallbackImage({ url: url || null });
    });
    return () => { cancelled = true; };
  }, [loading, artistId, artist?.picture_url, pictureFailed, fallbackImage, name]);

  if (!artistId) return null;

  const topTracks = dedupeTracks((profile?.top_tracks || [])
    .map((tr) => normalizeTrack({
      ...tr,
      artist_ids: tr.artist_ids?.length ? tr.artist_ids : [String(artistId)],
    }))
    .filter(Boolean));
  const shownTracks = topTracks.slice(0, visibleTracks);
  const hasMoreTracks = topTracks.length > visibleTracks;
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
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    onLoad={() => setAvatarLoaded(true)}
                    onError={() => {
                      // primary broke → fall through to Deezer; Deezer broke → emoji
                      if (primaryUrl) setPictureFailed(true);
                      else setFallbackImage({ url: null });
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '50%',
                      opacity: avatarLoaded ? 1 : 0,
                      transition: 'opacity 0.25s ease',
                    }}
                  />
                ) : (
                  emoji
                )}
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
                  {shownTracks.map((track) => {
                    const year = formatTrackYear(track);
                    const dur = track.duration_s ? formatDurationSeconds(track.duration_s) : null;
                    const meta = [year, dur].filter(Boolean).join(' · ');
                    return (
                      <li key={track.provider_id}>
                        <button
                          type="button"
                          className="artist-card-panel__track-btn"
                          onClick={() => onPlayTrack?.(track, topTracks)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span
                            className="artist-card-panel__track-title"
                            style={{ flex: 1, minWidth: 0 }}
                          >
                            {track.title}
                          </span>
                          {meta && (
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: '0.76rem',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {meta}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasMoreTracks && (
                  <button
                    type="button"
                    className="artist-card-panel__full-link"
                    onClick={() => setVisibleTracks((n) => n + TRACKS_PAGE)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
                  >
                    {lang === 'ru' ? 'Показать ещё' : 'Show more'}
                  </button>
                )}
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
