import { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { Play, ChevronLeft, Heart } from 'lucide-react';
import PlaylistModal from '../components/PlaylistModal';
import LibraryTrackRow from '../components/LibraryTrackRow';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import { useLibraryDataContext } from '../context/LibraryDataContext';
import { addAlbumToLibraryApi, removeAlbumFromLibraryApi } from '../utils/libraryApi';
import { hasAuthSession } from '../utils/hasAuthSession';

export default function AlbumView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  
  const { albums = [], setAlbums } = useLibraryDataContext() || {};

  const {
    togglePlay,
    currentTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    startTrackRadio,
    radioLoadingTrackId,
    t: globalT,
    lang,
  } = useOutletContext();

  const rowT = globalT || ((k) => k);

  useEffect(() => {
    let cancelled = false;
    const fetchAlbum = async () => {
      setLoading(true);
      try {
        const d = await apiGetJson(`/api/album/${id}`);
        if (cancelled) return;
        setData(d);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
      }
      if (!cancelled) setLoading(false);
    };
    fetchAlbum();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Loading Album...</h2>
      </div>
    );
  }

  if (!data || !data.album) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Album not found</h2>
      </div>
    );
  }

  const { album, tracks } = data;
  const isSaved = albums && albums.some((a) => String(a.provider_id) === String(album.id));

  const toggleSaveAlbum = async () => {
    if (!hasAuthSession()) {
      showToast(lang === 'ru' ? 'Сначала войдите в аккаунт' : 'Login to save albums');
      return;
    }
    
    try {
      if (isSaved) {
        const savedAlbum = albums.find((a) => String(a.provider_id) === String(album.id));
        if (savedAlbum) {
          await removeAlbumFromLibraryApi(savedAlbum.id, lang);
          if (setAlbums) setAlbums((prev) => prev.filter((a) => a.id !== savedAlbum.id));
          showToast(lang === 'ru' ? 'Альбом удален из медиатеки' : 'Album removed from library');
        }
      } else {
        const res = await addAlbumToLibraryApi(album, lang);
        if (setAlbums) setAlbums((prev) => [res, ...prev]);
        showToast(lang === 'ru' ? 'Альбом добавлен в медиатеку' : 'Album saved to library');
      }
    } catch (err) {
      showToast(messageForApiError(err, lang));
    }
  };

  return (
    <div style={{ padding: '0 20px', paddingBottom: '40px', overflowY: 'auto', height: '100%' }} className="hide-scrollbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', marginTop: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '50%', background: 'var(--bg-surface)' }}>
          <ChevronLeft size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '32px', marginBottom: '40px' }}>
        <div style={{ width: '250px', height: '250px', borderRadius: '16px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          {album.cover_url && (
            <img src={album.cover_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', color: 'white', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600, marginBottom: '8px' }}>Album</div>
          <h1 style={{ fontSize: '3.5rem', margin: 0, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.2, marginBottom: '12px' }}>{album.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            {album.artist && (
              <Link to={`/artist/${album.artist.id}`} style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                {album.artist.name}
              </Link>
            )}
            {album.releaseDate && album.releaseDate.trim().length > 0 && album.releaseDate.split('-')[0] !== '0000' && (
              <>
                <span>•</span>
                <span>{album.releaseDate.split('-')[0]}</span>
              </>
            )}
            <span>•</span>
            <span>{tracks.length} tracks</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <button 
              className="btn-primary" 
              style={{ borderRadius: '24px', padding: '12px 32px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => {
                if (tracks.length > 0) {
                  togglePlay(tracks[0], tracks);
                }
              }}
            >
              <Play size={20} fill="currentColor" /> Play Album
            </button>
            <button 
              className="btn-secondary" 
              style={{ borderRadius: '24px', padding: '12px 24px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: isSaved ? 'var(--accent-solid)' : 'rgba(255,255,255,0.1)', border: 'none', color: isSaved ? 'black' : 'white', cursor: 'pointer' }}
              onClick={toggleSaveAlbum}
            >
              <Heart size={20} fill={isSaved ? "currentColor" : "none"} /> {isSaved ? (lang === 'ru' ? 'В медиатеке' : 'In Library') : (lang === 'ru' ? 'В медиатеку' : 'Add to Library')}
            </button>
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.map((track, idx) => (
          <LibraryTrackRow
            key={track.provider_id}
            track={track}
            index={idx}
            list={tracks}
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
            testIdPrefix="album"
          />
        ))}
      </div>
      
      {playlistModalTrack && (
        <PlaylistModal 
          track={playlistModalTrack} 
          onClose={() => setPlaylistModalTrack(null)} 
        />
      )}
    </div>
  );
}
