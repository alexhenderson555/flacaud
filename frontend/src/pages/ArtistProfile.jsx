import { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { ChevronLeft, Disc, Loader2 } from 'lucide-react';
import LibraryTrackRow from '../components/LibraryTrackRow';
import PlaylistModal from '../components/PlaylistModal';
import { apiGetJson } from '../utils/apiClient';
import { coverImgSrc } from '../utils/coverUrl';
import { emojiAvatarForId } from '../utils/profileAvatars';
import { normalizeTrack } from '../utils/trackNormalize';

export default function ArtistProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [pictureFailed, setPictureFailed] = useState(false);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);

  const {
    togglePlay,
    currentTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    lang,
    t: globalT,
    startTrackRadio,
    radioLoadingTrackId,
  } = useOutletContext();

  const rowT = globalT || ((k) => k);

  useEffect(() => {
    let cancelled = false;
    const fetchArtist = async () => {
      setLoading(true);
      setPictureFailed(false);
      try {
        const d = await apiGetJson(`/api/artist/${id}`, { lang });
        if (cancelled) return;
        setData(d);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setData(null);
      }
      if (!cancelled) setLoading(false);
    };
    fetchArtist();
    return () => { cancelled = true; };
  }, [id, lang]);

  useEffect(() => {
    if (!data?.artist?.name) return undefined;
    let cancelled = false;
    setBioLoading(true);
    setBio('');
    void apiGetJson(`/api/artist/${id}/bio`, { lang, auth: true })
      .then((d) => {
        if (!cancelled) setBio((d?.bio || '').trim());
      })
      .catch(() => {
        if (!cancelled) setBio('');
      })
      .finally(() => {
        if (!cancelled) setBioLoading(false);
      });
    return () => { cancelled = true; };
  }, [data, id, lang]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Loading Artist...</h2>
      </div>
    );
  }

  if (!data || !data.artist) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Artist not found</h2>
      </div>
    );
  }

  const { artist, albums, top_tracks } = data;
  const hasPicture = !!(artist.picture || artist.picture_url) && !pictureFailed;
  const emoji = emojiAvatarForId(id);
  const normalizedTopTracks = (top_tracks || [])
    .map((track) => normalizeTrack({ ...track, artist_ids: track.artist_ids?.length ? track.artist_ids : [String(id)] }))
    .filter(Boolean);

  return (
    <div style={{ padding: '0 20px', paddingBottom: '40px', overflowY: 'auto', height: '100%' }} className="hide-scrollbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', marginTop: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '50%', background: 'var(--bg-surface)' }}>
          <ChevronLeft size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '32px', marginBottom: '40px' }}>
        {hasPicture ? (
          <img
            src={coverImgSrc(artist.picture_url || artist.picture)}
            alt={artist.name}
            onError={() => setPictureFailed(true)}
            style={{ width: '250px', height: '250px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', background: 'var(--bg-surface)' }}
          />
        ) : (
          <div
            className="artist-profile__emoji-avatar"
            style={{
              width: '250px',
              height: '250px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '6rem',
              background: 'var(--accent-gradient)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }}
            title={artist.name}
          >
            {emoji}
          </div>
        )}
        <div>
          <h1 style={{ fontSize: '3.5rem', margin: 0, fontWeight: 800, letterSpacing: '-1px' }}>{artist.name}</h1>
          <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Artist</div>
        </div>
      </div>

      {(bioLoading || bio) && (
        <div style={{ marginBottom: '40px', color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1.6, maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontWeight: 700, color: 'white' }}>About</h2>
          {bioLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                <Loader2 size={16} className="spin" />
                {lang === 'ru' ? 'Загрузка биографии…' : 'Loading bio…'}
              </div>
              {[1, 0.9, 0.6].map((width) => (
                <div
                  key={width}
                  style={{
                    height: '14px',
                    width: `${width * 100}%`,
                    borderRadius: '6px',
                    background: 'var(--text-muted)',
                    opacity: 0.15,
                  }}
                />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{bio}</p>
          )}
        </div>
      )}

      {normalizedTopTracks.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontWeight: 700 }}>Top Tracks</h2>
          <div className="track-list">
            {normalizedTopTracks.map((track, idx) => (
              <LibraryTrackRow
                key={track.provider_id}
                track={track}
                index={idx}
                list={normalizedTopTracks}
                t={rowT}
                likedTracks={likedTracks}
                downloadedTracks={downloadedTracks}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                isLoading={isLoading}
                onTogglePlay={togglePlay}
                onToggleLike={toggleLike}
                onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
                onDownload={handleDownload}
                onStartRadio={startTrackRadio}
                radioLoadingTrackId={radioLoadingTrackId}
                testIdPrefix="artist"
              />
            ))}
          </div>
        </div>
      )}

      {albums && albums.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '24px', fontWeight: 700 }}>Albums</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '24px' }}>
            {albums.map((album) => (
              <div
                key={album.id}
                role="button"
                tabIndex={0}
                className="glass-panel"
                style={{ padding: '16px', borderRadius: '16px', cursor: 'pointer', transition: 'transform 0.2s, background 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.background = 'var(--bg-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
                onClick={() => navigate(`/album/${album.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/album/${album.id}`); }}
              >
                <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 10px 20px rgba(0,0,0,0.3)' }}>
                  {album.cover_url ? (
                    <img src={coverImgSrc(album.cover_url)} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Disc size={48} color="var(--text-muted)" />
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{album.title}</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{album.release_date ? album.release_date.split('-')[0] : 'Album'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {playlistModalTrack && (
        <PlaylistModal
          track={playlistModalTrack}
          onClose={() => setPlaylistModalTrack(null)}
        />
      )}
    </div>
  );
}
